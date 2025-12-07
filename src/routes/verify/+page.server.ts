import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, twoFactorCodes, sessions } from '$lib/server/db';
import { eq, and, gt } from 'drizzle-orm';
import { lucia } from '$lib/server/auth';
import { generate2FACode } from '$lib/server/auth/pin';
import { send2FACode } from '$lib/server/email';

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

		const { userId } = JSON.parse(pendingAuth);
		const formData = await request.formData();
		const code = formData.get('code')?.toString().trim();

		if (!code) {
			return fail(400, { error: 'Verification code is required' });
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
			return fail(400, { error: 'Invalid or expired verification code' });
		}

		// Mark code as used
		await db
			.update(twoFactorCodes)
			.set({ used: true })
			.where(eq(twoFactorCodes.id, validCode.id));

		// Create session with 2FA verified
		const userAgent = request.headers.get('user-agent') || '';
		const ipAddress = getClientAddress();

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

	resend: async ({ cookies }) => {
		const pendingAuth = cookies.get('pending_auth');
		if (!pendingAuth) {
			throw redirect(302, '/login');
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
