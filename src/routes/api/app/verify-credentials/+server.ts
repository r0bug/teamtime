import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { CRON_SECRET } from '$env/static/private';
import { db, users } from '$lib/server/db';
import { verifyPin } from '$lib/server/auth/pin';

/**
 * POST /api/app/verify-credentials — machine-to-machine credential check for
 * the ListFlow credential-proxy login (fleet Standards §1: TeamTime is the
 * identity provider; satellite apps verify here and issue their own JWTs).
 *
 * Guarded by the same bearer secret as GET /api/staff (CRON_SECRET), so it is
 * NEVER callable from a browser — only ListFlow's backend, server-to-server.
 *
 * Body: { email, secret } where secret is the user's PIN (staff) or password
 * (vendor-portal users). Tries PIN first, then password. Returns the identity
 * fields ListFlow needs; never mints a TeamTime session.
 */
export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	const apiKey = authHeader?.replace('Bearer ', '');
	if (!apiKey || apiKey !== CRON_SECRET) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as { email?: string; secret?: string };
	const email = body.email?.toString().toLowerCase().trim();
	const secret = body.secret?.toString() ?? '';

	const invalid = async () => {
		await new Promise((r) => setTimeout(r, 400)); // don't leak which emails exist
		return json({ error: 'Invalid credentials' }, { status: 401 });
	};
	if (!email || !secret) return invalid();

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (!user || !user.isActive) return invalid();

	let ok = false;
	if (user.pinHash) {
		ok = await verifyPin(secret, user.pinHash).catch(() => false);
	}
	if (!ok && user.passwordHash) {
		ok = await verify(user.passwordHash, secret).catch(() => false);
	}
	if (!ok) return invalid();

	return json({
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			canListOnEbay: user.canListOnEbay
		}
	});
};
