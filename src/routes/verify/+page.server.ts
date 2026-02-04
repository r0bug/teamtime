import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, twoFactorCodes, users } from '$lib/server/db';
import { eq, and, gt } from 'drizzle-orm';
import { lucia } from '$lib/server/auth';
import { generate2FACode } from '$lib/server/auth/pin';
import { send2FACode } from '$lib/server/email';
import {
	checkRateLimit,
	recordLoginAttempt,
	clearRateLimit
} from '$lib/server/auth/rate-limiter';

export const load: PageServerLoad = async ({ cookies }) => {
	const pendingAuth = cookies.get('pending_auth');
	if (!pendingAuth) {
		throw redirect(302, '/login');
	}

	const { email } = JSON.parse(pendingAuth);
	return { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') }; // Mask email
};

export const actions: Actions = {
	verify: async ({ request, cookies, getClientAddress }) => {
		const pendingAuth = cookies.get('pending_auth');
		if (!pendingAuth) {
			throw redirect(302, '/login');
		}

		const { userId, email, ipAddress: storedIp } = JSON.parse(pendingAuth);
		const formData = await request.formData();
		const code = formData.get('code')?.toString().trim();
		const userAgent = request.headers.get('user-agent') || '';
		const ipAddress = getClientAddress();

		if (!code) {
			return fail(400, { error: 'Verification code is required' });
		}

		// Check rate limiting for 2FA attempts
		const rateLimitStatus = checkRateLimit(ipAddress);
		if (rateLimitStatus.isLimited) {
			const retrySeconds = Math.ceil(rateLimitStatus.retryAfterMs / 1000);
			return fail(429, {
				error: `Too many verification attempts. Please try again in ${retrySeconds} seconds.`,
				retryAfter: retrySeconds
			});
		}

		// Find valid 2FA code
		const [validCode] = await db
			.select()
			.from(twoFactorCodes)
			.where(
				and(
					eq(twoFactorCodes.userId, userId),
					eq(twoFactorCodes.code, code),
					eq(twoFactorCodes.used, false),
					gt(twoFactorCodes.expiresAt, new Date())
				)
			)
			.limit(1);

		if (!validCode) {
			// Record failed 2FA attempt
			const { shouldLock, lockoutUntil } = await recordLoginAttempt({
				email: email || 'unknown',
				ipAddress,
				userAgent,
				result: '2fa_failed',
				userId,
				failureReason: 'Invalid or expired 2FA code'
			});

			if (shouldLock && lockoutUntil) {
				const minutesRemaining = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
				cookies.delete('pending_auth', { path: '/' });
				return fail(423, {
					error: `Too many failed attempts. Account locked for ${minutesRemaining} minutes.`,
					lockedUntil: lockoutUntil
				});
			}

			return fail(400, { error: 'Invalid or expired verification code' });
		}

		// Mark code as used
		await db.update(twoFactorCodes).set({ used: true }).where(eq(twoFactorCodes.id, validCode.id));

		// Record successful 2FA and clear rate limit
		await recordLoginAttempt({
			email: email || 'unknown',
			ipAddress,
			userAgent,
			result: 'success',
			userId
		});
		clearRateLimit(ipAddress);

		// Create session with 2FA verified
		const session = await lucia.createSession(userId, {
			deviceFingerprint: null,
			ipAddress,
			userAgent,
			lastActive: new Date(),
			last2faAt: new Date()
		});

		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		// Clear pending auth
		cookies.delete('pending_auth', { path: '/' });

		throw redirect(302, '/dashboard');
	},

	resend: async ({ cookies, getClientAddress }) => {
		const pendingAuth = cookies.get('pending_auth');
		if (!pendingAuth) {
			throw redirect(302, '/login');
		}

		const ipAddress = getClientAddress();

		// Rate limit resend requests (use same rate limiter)
		const rateLimitStatus = checkRateLimit(ipAddress);
		if (rateLimitStatus.isLimited) {
			const retrySeconds = Math.ceil(rateLimitStatus.retryAfterMs / 1000);
			return fail(429, {
				error: `Too many requests. Please try again in ${retrySeconds} seconds.`,
				retryAfter: retrySeconds
			});
		}

		const { userId, email } = JSON.parse(pendingAuth);

		// Generate new code
		const code = generate2FACode();
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

		await db.insert(twoFactorCodes).values({
			userId,
			code,
			expiresAt
		});

		await send2FACode(email, code);

		return { success: true };
	}
};
