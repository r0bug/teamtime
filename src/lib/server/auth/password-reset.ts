/**
 * Self-service password-reset tokens (vendor portal recovery).
 *
 * Tokens are random 32-byte secrets; only their SHA-256 hash is stored. The raw
 * token travels solely in the SMS/email reset link. Tokens are single-use and
 * expire after 30 minutes. Redeeming sets the new password, clears
 * `mustChangePassword`, and invalidates the user's existing sessions.
 */
import { randomBytes, createHash } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, passwordResetTokens, type PasswordResetToken } from '$lib/server/db/schema';
import { hashPin } from '$lib/server/auth/pin';
import { lucia } from '$lib/server/auth';
import { createLogger } from '$lib/server/logger';

const log = createLogger('auth:password-reset');
const TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Create a single-use reset token; returns the raw token (its only plaintext appearance). */
export async function createResetToken(userId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	await db.insert(passwordResetTokens).values({
		userId,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
	});
	return token;
}

/** Look up an unused, unexpired token (for validating the reset page on GET). */
export async function findValidToken(token: string): Promise<PasswordResetToken | null> {
	if (!token) return null;
	const [row] = await db
		.select()
		.from(passwordResetTokens)
		.where(
			and(
				eq(passwordResetTokens.tokenHash, hashToken(token)),
				gt(passwordResetTokens.expiresAt, new Date()),
				isNull(passwordResetTokens.usedAt)
			)
		)
		.limit(1);
	return row ?? null;
}

export interface RedeemResult {
	ok: boolean;
	reason?: string;
}

/** Consume a token and set the user's new password. */
export async function redeemResetToken(token: string, newPassword: string): Promise<RedeemResult> {
	if (newPassword.length < 8) return { ok: false, reason: 'Password must be at least 8 characters' };

	const row = await findValidToken(token);
	if (!row) return { ok: false, reason: 'This reset link is invalid or has expired.' };

	// Claim the token first (single-use guard against double-submit / races).
	const [claimed] = await db
		.update(passwordResetTokens)
		.set({ usedAt: new Date() })
		.where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
		.returning({ id: passwordResetTokens.id });
	if (!claimed) return { ok: false, reason: 'This reset link has already been used.' };

	const passwordHash = await hashPin(newPassword);
	await db
		.update(users)
		.set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
		.where(eq(users.id, row.userId));
	await lucia.invalidateUserSessions(row.userId);

	log.info({ userId: row.userId }, 'Password reset via self-service link');
	return { ok: true };
}
