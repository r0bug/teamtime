/**
 * Rate Limiter for Authentication Endpoints
 *
 * Provides sliding window rate limiting to prevent brute force attacks.
 * For single-server deployments, uses in-memory storage.
 * For production with multiple servers, upgrade to Redis-based solution.
 */

import { db, loginAttempts, accountLockouts, users } from '$lib/server/db';
import { eq, and, gt, gte, desc, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import type { LoginAttempt, NewLoginAttempt } from '$lib/server/db/schema';

const log = createLogger('rate-limiter');

// Configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute sliding window
const MAX_ATTEMPTS_PER_WINDOW = 5; // 5 attempts per minute per IP
const LOCKOUT_THRESHOLD = 10; // Lock account after 10 failed attempts
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minute lockout
const PROGRESSIVE_LOCKOUT_MULTIPLIER = 2; // Double lockout time for repeated lockouts

// In-memory sliding window store for IP-based rate limiting
interface RateLimitEntry {
	attempts: number[];
	lastCleanup: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastGlobalCleanup = Date.now();

function cleanupStore(): void {
	const now = Date.now();
	const cutoff = now - RATE_LIMIT_WINDOW_MS * 2; // Keep entries for 2x the window

	for (const [key, entry] of rateLimitStore.entries()) {
		// Remove entries with no recent attempts
		if (entry.attempts.length === 0 || entry.attempts[entry.attempts.length - 1] < cutoff) {
			rateLimitStore.delete(key);
		}
	}
	lastGlobalCleanup = now;
}

/**
 * Check if an IP address is rate limited
 * @returns Object with isLimited flag and remaining attempts
 */
export function checkRateLimit(ipAddress: string): {
	isLimited: boolean;
	remainingAttempts: number;
	retryAfterMs: number;
} {
	const now = Date.now();
	const windowStart = now - RATE_LIMIT_WINDOW_MS;

	// Periodic global cleanup
	if (now - lastGlobalCleanup > CLEANUP_INTERVAL_MS) {
		cleanupStore();
	}

	let entry = rateLimitStore.get(ipAddress);
	if (!entry) {
		entry = { attempts: [], lastCleanup: now };
		rateLimitStore.set(ipAddress, entry);
	}

	// Clean up old attempts for this entry
	entry.attempts = entry.attempts.filter((t) => t > windowStart);

	const attemptsInWindow = entry.attempts.length;
	const isLimited = attemptsInWindow >= MAX_ATTEMPTS_PER_WINDOW;

	let retryAfterMs = 0;
	if (isLimited && entry.attempts.length > 0) {
		// Calculate when the oldest attempt in window will expire
		const oldestAttempt = Math.min(...entry.attempts);
		retryAfterMs = oldestAttempt + RATE_LIMIT_WINDOW_MS - now;
	}

	return {
		isLimited,
		remainingAttempts: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - attemptsInWindow),
		retryAfterMs: Math.max(0, retryAfterMs)
	};
}

/**
 * Record an attempt from an IP address
 */
export function recordAttempt(ipAddress: string): void {
	const now = Date.now();
	let entry = rateLimitStore.get(ipAddress);

	if (!entry) {
		entry = { attempts: [], lastCleanup: now };
		rateLimitStore.set(ipAddress, entry);
	}

	entry.attempts.push(now);
}

/**
 * Check if an account is locked
 */
export async function isAccountLocked(email: string): Promise<{
	isLocked: boolean;
	lockedUntil: Date | null;
	reason: string | null;
}> {
	const [activeLockout] = await db
		.select()
		.from(accountLockouts)
		.where(
			and(
				eq(accountLockouts.email, email.toLowerCase()),
				gt(accountLockouts.lockedUntil, new Date()),
				sql`${accountLockouts.unlockedAt} IS NULL`
			)
		)
		.orderBy(desc(accountLockouts.lockedAt))
		.limit(1);

	if (activeLockout) {
		return {
			isLocked: true,
			lockedUntil: activeLockout.lockedUntil,
			reason: activeLockout.reason
		};
	}

	return { isLocked: false, lockedUntil: null, reason: null };
}

/**
 * Record a login attempt and handle account lockout logic
 */
export async function recordLoginAttempt(params: {
	email: string;
	ipAddress: string;
	userAgent: string | null;
	result: LoginAttempt['result'];
	userId?: string | null;
	failureReason?: string;
}): Promise<{
	shouldLock: boolean;
	lockoutUntil: Date | null;
}> {
	const { email, ipAddress, userAgent, result, userId, failureReason } = params;
	const normalizedEmail = email.toLowerCase();

	// Record the attempt in database
	await db.insert(loginAttempts).values({
		email: normalizedEmail,
		userId: userId || null,
		ipAddress,
		userAgent,
		result,
		failureReason
	});

	// Record in-memory rate limit
	if (result !== 'success') {
		recordAttempt(ipAddress);
	}

	// Check if we should lock the account
	if (result === 'invalid_credentials' || result === '2fa_failed') {
		// Count recent failed attempts for this email
		const windowStart = new Date(Date.now() - 30 * 60 * 1000); // 30 minute window for lockout
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(loginAttempts)
			.where(
				and(
					eq(loginAttempts.email, normalizedEmail),
					sql`${loginAttempts.result} IN ('invalid_credentials', '2fa_failed')`,
					gte(loginAttempts.attemptedAt, windowStart)
				)
			);

		if (count >= LOCKOUT_THRESHOLD) {
			// Check for previous lockouts to implement progressive lockout
			const [previousLockout] = await db
				.select()
				.from(accountLockouts)
				.where(eq(accountLockouts.email, normalizedEmail))
				.orderBy(desc(accountLockouts.lockedAt))
				.limit(1);

			let lockoutDuration = LOCKOUT_DURATION_MS;
			if (previousLockout) {
				// If there was a lockout in the last 24 hours, double the duration
				const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
				if (previousLockout.lockedAt > dayAgo) {
					lockoutDuration = Math.min(
						lockoutDuration * PROGRESSIVE_LOCKOUT_MULTIPLIER,
						60 * 60 * 1000 // Max 1 hour
					);
				}
			}

			const lockedUntil = new Date(Date.now() + lockoutDuration);

			// Get the user ID if not provided
			let lockUserId = userId;
			if (!lockUserId) {
				const [user] = await db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.email, normalizedEmail))
					.limit(1);
				lockUserId = user?.id;
			}

			// Create lockout record
			await db.insert(accountLockouts).values({
				email: normalizedEmail,
				userId: lockUserId || null,
				lockedUntil,
				reason: `Too many failed login attempts (${count} in 30 minutes)`,
				failedAttempts: count
			});

			log.warn({
				email: normalizedEmail,
				failedAttempts: count,
				lockedUntil: lockedUntil.toISOString()
			}, 'Account locked due to excessive failed login attempts');

			return { shouldLock: true, lockoutUntil: lockedUntil };
		}
	}

	return { shouldLock: false, lockoutUntil: null };
}

/**
 * Clear rate limit for an IP (e.g., after successful login)
 */
export function clearRateLimit(ipAddress: string): void {
	rateLimitStore.delete(ipAddress);
}

/**
 * Manually unlock an account (admin function)
 */
export async function unlockAccount(email: string, unlockedByUserId: string): Promise<boolean> {
	const normalizedEmail = email.toLowerCase();

	const result = await db
		.update(accountLockouts)
		.set({
			unlockedAt: new Date(),
			unlockedBy: unlockedByUserId
		})
		.where(
			and(
				eq(accountLockouts.email, normalizedEmail),
				gt(accountLockouts.lockedUntil, new Date()),
				sql`${accountLockouts.unlockedAt} IS NULL`
			)
		);

	log.info({
		email: normalizedEmail,
		unlockedByUserId
	}, 'Account manually unlocked');

	return true;
}

/**
 * Get login attempt statistics for an email (for admin review)
 */
export async function getLoginAttemptStats(email: string, windowMinutes = 60): Promise<{
	totalAttempts: number;
	failedAttempts: number;
	successfulAttempts: number;
	lastAttempt: Date | null;
	recentIpAddresses: string[];
}> {
	const normalizedEmail = email.toLowerCase();
	const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

	const attempts = await db
		.select()
		.from(loginAttempts)
		.where(
			and(eq(loginAttempts.email, normalizedEmail), gte(loginAttempts.attemptedAt, windowStart))
		)
		.orderBy(desc(loginAttempts.attemptedAt));

	const ipAddresses = [...new Set(attempts.map((a) => a.ipAddress))];

	return {
		totalAttempts: attempts.length,
		failedAttempts: attempts.filter(
			(a) => a.result === 'invalid_credentials' || a.result === '2fa_failed'
		).length,
		successfulAttempts: attempts.filter((a) => a.result === 'success').length,
		lastAttempt: attempts[0]?.attemptedAt || null,
		recentIpAddresses: ipAddresses.slice(0, 10)
	};
}
