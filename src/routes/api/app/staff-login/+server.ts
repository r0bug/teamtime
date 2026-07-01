import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, users } from '$lib/server/db';
import { lucia } from '$lib/server/auth';
import { verifyPin } from '$lib/server/auth/pin';

/**
 * POST /api/app/staff-login — email + PIN login for the label app's STAFF mode.
 *
 * Mirrors /api/app/login, but authenticates by PIN (staff/manager accounts sign
 * in by PIN, not a password) and requires a manager/admin role so the caller can
 * use the admin act-on-behalf endpoints. Returns { token, cookieName } exactly
 * like /api/app/login, so the desktop app stores + sends it the same way.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as { email?: string; pin?: string };
	const email = body.email?.toString().toLowerCase().trim();
	const pin = body.pin?.toString() ?? '';

	const invalid = () => error(401, 'Invalid email or PIN');
	if (!email || !pin) throw invalid();

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (!user || !user.pinHash || !user.isActive) {
		await new Promise((r) => setTimeout(r, 400)); // don't leak which emails exist
		throw invalid();
	}

	const ok = await verifyPin(pin, user.pinHash);
	if (!ok) {
		await new Promise((r) => setTimeout(r, 400));
		throw invalid();
	}

	if (user.role !== 'manager' && user.role !== 'admin') {
		throw error(403, 'Staff mode requires a manager account');
	}

	const session = await lucia.createSession(user.id, {
		deviceFingerprint: 'desktop-label-app-staff',
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? 'desktop-label-app-staff',
		lastActive: new Date(),
		last2faAt: new Date()
	});

	return json({ token: session.id, cookieName: lucia.sessionCookieName });
};
