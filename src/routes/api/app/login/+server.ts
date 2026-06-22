/**
 * POST /api/app/login — token login for the standalone desktop label app.
 *
 * Body: { email, password }. Validates the password (argon2), mints a Lucia
 * session, and returns its id as a token. The desktop app then sends that token
 * as the `auth_session` cookie on every other call, so it can use the full
 * cookie-authenticated contract (`/api/me`, `/api/vendor/items`, the print
 * queue, `/api/vendor/tag-zpl`, …) exactly as the browser does.
 *
 * Unlike the web `/login` form this skips the new-device 2FA email step, which
 * a kiosk/desktop client can't complete. It works for any active account; the
 * app calls `/api/me` afterwards to learn whether it's in vendor or store mode.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { db, users } from '$lib/server/db';
import { lucia } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
	const email = body.email?.toString().toLowerCase().trim();
	const password = body.password?.toString() ?? '';

	const invalid = () => error(401, 'Invalid email or password');
	if (!email || !password) throw invalid();

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (!user || !user.passwordHash || !user.isActive) {
		await new Promise((r) => setTimeout(r, 400)); // constant-time-ish; don't leak which emails exist
		throw invalid();
	}

	const ok = await verify(user.passwordHash, password);
	if (!ok) {
		await new Promise((r) => setTimeout(r, 400));
		throw invalid();
	}

	const session = await lucia.createSession(user.id, {
		deviceFingerprint: 'desktop-label-app',
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? 'desktop-label-app',
		lastActive: new Date(),
		last2faAt: new Date()
	});

	// `token` is the session id — send it back as the `auth_session` cookie.
	return json({ token: session.id, cookieName: lucia.sessionCookieName });
};
