import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, users, sessions, twoFactorCodes } from '$lib/server/db';
import { eq, and, gt } from 'drizzle-orm';
import { verifyPin, generate2FACode } from '$lib/server/auth/pin';
import { lucia } from '$lib/server/auth';
import { send2FACode } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().toLowerCase().trim();
		const pin = formData.get('pin')?.toString();

		if (!email || !pin) {
			return fail(400, { error: 'Email and PIN are required' });
		}

		// Find user
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (!user) {
			// Use same delay as valid user to prevent timing attacks
			await new Promise((r) => setTimeout(r, 500));
			return fail(400, { error: 'Invalid email or PIN' });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Account is disabled. Contact your administrator.' });
		}

		// Verify PIN
		const validPin = await verifyPin(pin, user.pinHash);
		if (!validPin) {
			return fail(400, { error: 'Invalid email or PIN' });
		}

		// Check if 2FA is needed (new device or long time since last 2FA)
		const userAgent = request.headers.get('user-agent') || '';
		const ipAddress = getClientAddress();

		// For now, check if there's a recent session with 2FA from same device
		const recentSession = await db
			.select()
			.from(sessions)
			.where(
				and(
					eq(sessions.userId, user.id),
					eq(sessions.ipAddress, ipAddress),
					gt(sessions.last2faAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // 30 days
				)
			)
			.limit(1);

		if (recentSession.length === 0) {
			// Need 2FA
			const code = generate2FACode();
			const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

			await db.insert(twoFactorCodes).values({
				userId: user.id,
				code,
				expiresAt
			});

			// Send code via email
			await send2FACode(user.email, code);

			// Store pending auth in cookie
			cookies.set('pending_auth', JSON.stringify({ userId: user.id, email: user.email }), {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 60 * 10 // 10 minutes
			});

			throw redirect(302, '/verify');
		}

		// Create session without 2FA
		const session = await lucia.createSession(user.id, {
			deviceFingerprint: null,
			ipAddress,
			userAgent,
			lastActive: new Date(),
			last2faAt: recentSession[0].last2faAt // Carry over last 2FA time
		});

		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		throw redirect(302, '/dashboard');
	}
};
