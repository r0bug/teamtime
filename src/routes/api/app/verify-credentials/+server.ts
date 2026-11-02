/**
 * POST /api/app/verify-credentials — server-to-server credential check for
 * value.trickpc.com (photo appraisal tool), so staff and vendors sign in there
 * with their TeamTime email + PIN or password.
 *
 * Auth: `x-service-key: <VALUE_APP_SECRET>`. Without it this is a 404, so it is
 * not a public password oracle.
 * Body: { email, password?, pin?, clientIp?, userAgent? } — clientIp is the phone's
 * address as seen by the appraisal tool, so the IP rate limit and the login audit
 * apply to the real client rather than to the hosting box.
 *
 * Same rules as the web /login form (IP rate limit, account lockout, attempts
 * recorded, password-if-set-else-PIN, generic failure message) but mints NO
 * TeamTime session and skips 2FA. Returns the identity the tool needs.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { db, users } from '$lib/server/db';
import { verifyPin } from '$lib/server/auth/pin';
import {
	checkRateLimit,
	isAccountLocked,
	recordLoginAttempt
} from '$lib/server/auth/rate-limiter';
import { getValueAppIdentity, isValidServiceKey } from '$lib/server/services/value-app-service';

const GENERIC = 'Invalid email or PIN/password';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!isValidServiceKey(request.headers.get('x-service-key'))) throw error(404, 'Not found');

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const email = String(body.email ?? '').toLowerCase().trim();
	const password = String(body.password ?? '');
	const pin = String(body.pin ?? '');
	const ipAddress = String(body.clientIp ?? '').slice(0, 64) || getClientAddress();
	const userAgent = String(body.userAgent ?? '').slice(0, 300) || 'value.trickpc.com';

	if (!email || (!password && !pin)) throw error(400, 'Email and PIN or password are required');

	const rate = checkRateLimit(ipAddress);
	if (rate.isLimited) {
		throw error(429, `Too many login attempts. Try again in ${Math.ceil(rate.retryAfterMs / 1000)} seconds.`);
	}

	const lock = await isAccountLocked(email);
	if (lock.isLocked) {
		await recordLoginAttempt({ email, ipAddress, userAgent, result: 'account_locked', failureReason: 'Account is locked (value app)' });
		throw error(423, 'Account is temporarily locked. Try again later or contact a manager.');
	}

	const fail = async (
		reason: string,
		userId?: string,
		result: 'invalid_credentials' | 'account_disabled' = 'invalid_credentials'
	) => {
		const res = await recordLoginAttempt({
			email,
			ipAddress,
			userAgent,
			result,
			userId,
			failureReason: `${reason} (value app)`
		});
		if (res.shouldLock) throw error(423, 'Too many failed attempts. Account locked.');
		await new Promise((r) => setTimeout(r, 500));
		throw error(401, GENERIC);
	};

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (!user) return fail('User not found');
	if (!user.isActive) return fail('Account disabled', user.id, 'account_disabled');

	// The phone form has ONE secret field, so accept whichever credential the
	// account has: its password (vendors) or its PIN (staff). Both are valid
	// TeamTime credentials for this user on the web login.
	const secret = password || pin;
	let ok = false;
	if (user.passwordHash) {
		ok = await verify(user.passwordHash, secret).catch(() => false);
	}
	if (!ok && user.pinHash) {
		ok = await verifyPin(secret, user.pinHash).catch(() => false);
	}
	if (!ok) return fail('Invalid credentials', user.id);

	const identity = await getValueAppIdentity(user.id);
	if (!identity) return fail('Vendor portal disabled', user.id, 'account_disabled');

	await recordLoginAttempt({ email, ipAddress, userAgent, result: 'success', userId: user.id });
	return json(identity);
};
