/**
 * SMS Chat Service
 *
 * Supports two-way SMS conversations between admin/manager users and the
 * Office Manager AI. Mirrors the web chat but adds:
 *   - Per-user rolling session (one active SMS chat, auto-extended, expires after inactivity)
 *   - Rate limiting (messages per window)
 *   - PIN verification for destructive actions (reuses the user's login PIN)
 *   - Lockout after repeated wrong PIN attempts
 */
import { db, officeManagerChats, officeManagerPendingActions, users, smsLogs } from '$lib/server/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { verifyPin } from '$lib/server/auth/pin';
import { createLogger } from '$lib/server/logger';
import type { OfficeManagerMessage } from '$lib/server/db/schema';

const log = createLogger('service:sms-chat');

// Session inactivity: if the user hasn't texted in this long, start a fresh chat
export const SMS_SESSION_IDLE_MINUTES = 120;
// Rate limit: max inbound SMS office-manager messages per user per window
export const SMS_RATE_LIMIT_WINDOW_MINUTES = 15;
export const SMS_RATE_LIMIT_MAX = 10;
// PIN lockout after this many wrong PIN attempts on a single pending action
export const SMS_PIN_MAX_ATTEMPTS = 3;
export const SMS_PIN_LOCKOUT_MINUTES = 30;

/**
 * Find or create the active SMS chat session for a user.
 *
 * Returns the most recently-updated `channel='sms'` chat updated within the
 * idle window. If none exists, creates a fresh one. Callers should write the
 * inbound message into this chat and then call processUserMessage.
 */
export async function getOrCreateSmsChat(userId: string): Promise<{ id: string; createdNew: boolean }> {
	const cutoff = new Date(Date.now() - SMS_SESSION_IDLE_MINUTES * 60_000);

	const [existing] = await db
		.select({ id: officeManagerChats.id })
		.from(officeManagerChats)
		.where(
			and(
				eq(officeManagerChats.userId, userId),
				eq(officeManagerChats.channel, 'sms'),
				gte(officeManagerChats.updatedAt, cutoff)
			)
		)
		.orderBy(desc(officeManagerChats.updatedAt))
		.limit(1);

	if (existing) {
		return { id: existing.id, createdNew: false };
	}

	const [created] = await db
		.insert(officeManagerChats)
		.values({
			userId,
			title: `SMS chat ${new Date().toISOString().slice(0, 10)}`,
			channel: 'sms',
			messages: []
		})
		.returning({ id: officeManagerChats.id });

	return { id: created.id, createdNew: true };
}

/**
 * Check whether the user is currently locked out of SMS office-manager commands.
 */
export async function isSmsLocked(userId: string): Promise<{ locked: boolean; until?: Date }> {
	const [user] = await db
		.select({ smsLockedUntil: users.smsLockedUntil })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user?.smsLockedUntil) return { locked: false };
	if (user.smsLockedUntil.getTime() > Date.now()) {
		return { locked: true, until: user.smsLockedUntil };
	}
	return { locked: false };
}

/**
 * Lock a user out of SMS commands for SMS_PIN_LOCKOUT_MINUTES.
 */
export async function lockSmsUser(userId: string): Promise<void> {
	const until = new Date(Date.now() + SMS_PIN_LOCKOUT_MINUTES * 60_000);
	await db.update(users).set({ smsLockedUntil: until, updatedAt: new Date() }).where(eq(users.id, userId));
	log.warn({ userId, until }, 'User locked out of SMS commands after repeated wrong PIN attempts');
}

/**
 * Enforce a per-user rate limit using the smsLogs table as the source of truth.
 * Counts inbound messages from this user within the window.
 */
export async function checkSmsRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
	const windowStart = new Date(Date.now() - SMS_RATE_LIMIT_WINDOW_MINUTES * 60_000);

	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(smsLogs)
		.where(
			and(
				eq(smsLogs.userId, userId),
				eq(smsLogs.direction, 'inbound'),
				gte(smsLogs.createdAt, windowStart)
			)
		);

	const remaining = Math.max(0, SMS_RATE_LIMIT_MAX - count);
	return { allowed: count <= SMS_RATE_LIMIT_MAX, remaining };
}

/**
 * Verify a user's PIN against their stored hash.
 */
export async function verifyUserPin(userId: string, pin: string): Promise<boolean> {
	const [user] = await db
		.select({ pinHash: users.pinHash })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) return false;
	return verifyPin(pin, user.pinHash);
}

/**
 * Find the user's most recent pending SMS action that still requires a PIN.
 * Used when the next inbound SMS is interpreted as a PIN reply.
 */
export async function findAwaitingPinAction(chatId: string): Promise<
	| {
			id: string;
			toolName: string;
			toolArgs: Record<string, unknown>;
			confirmationMessage: string;
			pinAttempts: number;
			expiresAt: Date;
	  }
	| null
> {
	const [action] = await db
		.select({
			id: officeManagerPendingActions.id,
			toolName: officeManagerPendingActions.toolName,
			toolArgs: officeManagerPendingActions.toolArgs,
			confirmationMessage: officeManagerPendingActions.confirmationMessage,
			pinAttempts: officeManagerPendingActions.pinAttempts,
			expiresAt: officeManagerPendingActions.expiresAt
		})
		.from(officeManagerPendingActions)
		.where(
			and(
				eq(officeManagerPendingActions.chatId, chatId),
				eq(officeManagerPendingActions.status, 'pending'),
				eq(officeManagerPendingActions.requiresPin, true)
			)
		)
		.orderBy(desc(officeManagerPendingActions.createdAt))
		.limit(1);

	if (!action) return null;
	if (action.expiresAt.getTime() < Date.now()) return null;

	return {
		...action,
		toolArgs: action.toolArgs as Record<string, unknown>
	};
}

/**
 * Increment the pin-attempt counter on a pending action. If it reaches the max,
 * reject the action so it can't be approved and lock the user.
 */
export async function recordPinAttempt(
	actionId: string,
	userId: string,
	success: boolean
): Promise<{ attemptsRemaining: number; lockedOut: boolean }> {
	if (success) {
		return { attemptsRemaining: SMS_PIN_MAX_ATTEMPTS, lockedOut: false };
	}

	const [action] = await db
		.update(officeManagerPendingActions)
		.set({ pinAttempts: sql`${officeManagerPendingActions.pinAttempts} + 1` })
		.where(eq(officeManagerPendingActions.id, actionId))
		.returning({ pinAttempts: officeManagerPendingActions.pinAttempts });

	const attempts = action?.pinAttempts ?? 0;
	const attemptsRemaining = Math.max(0, SMS_PIN_MAX_ATTEMPTS - attempts);

	if (attempts >= SMS_PIN_MAX_ATTEMPTS) {
		// Auto-reject the pending action and lock the user
		await db
			.update(officeManagerPendingActions)
			.set({ status: 'rejected' })
			.where(eq(officeManagerPendingActions.id, actionId));
		await lockSmsUser(userId);
		return { attemptsRemaining: 0, lockedOut: true };
	}

	return { attemptsRemaining, lockedOut: false };
}

/**
 * Mark the most-recently-created pending actions on a chat as requiring PIN.
 * Called after processUserMessage on an SMS chat to flag any confirmation
 * actions the LLM just scheduled.
 */
export async function markRecentActionsRequirePin(chatId: string, sinceMs: number): Promise<number> {
	const since = new Date(sinceMs);
	const updated = await db
		.update(officeManagerPendingActions)
		.set({ requiresPin: true })
		.where(
			and(
				eq(officeManagerPendingActions.chatId, chatId),
				eq(officeManagerPendingActions.status, 'pending'),
				gte(officeManagerPendingActions.createdAt, since)
			)
		)
		.returning({ id: officeManagerPendingActions.id });
	return updated.length;
}

/**
 * Format a session's messages for display.
 */
export function formatMessagesForDisplay(messages: OfficeManagerMessage[]): Array<{
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}> {
	return messages.map((m) => ({
		role: m.role,
		content: m.content,
		timestamp: m.timestamp
	}));
}
