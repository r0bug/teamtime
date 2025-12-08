import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, users, sessions, twoFactorCodes, appSettings } from '$lib/server/db';
import { eq, and, gt } from 'drizzle-orm';
import { verifyPin, generate2FACode } from '$lib/server/auth/pin';
import { lucia } from '$lib/server/auth';
import { send2FACode } from '$lib/server/email';
import { verify } from '@node-rs/argon2';

async function is2FAEnabled(): Promise<boolean> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, '2fa_enabled'))
		.limit(1);
	return setting?.value === 'true';
}

async function isPinOnlyLogin(): Promise<boolean> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'pin_only_login'))
		.limit(1);
	// Default to true (PIN login) if setting doesn't exist
	return setting?.value !== 'false';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}

	const pinOnly = await isPinOnlyLogin();

	// Get site title for branding
	const [titleSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'site_title'))
		.limit(1);

	return {
		pinOnlyLogin: pinOnly,
		siteTitle: titleSetting?.value || 'TeamTime'
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().toLowerCase().trim();
		const pin = formData.get('pin')?.toString();
		const password = formData.get('password')?.toString();

		const pinOnly = await isPinOnlyLogin();

		if (!email) {
			return fail(400, { error: 'Email is required' });
		}

		if (pinOnly && !pin) {
			return fail(400, { error: 'Email and PIN are required' });
		}

		if (!pinOnly && !password) {
			return fail(400, { error: 'Email and password are required' });
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
			return fail(400, { error: pinOnly ? 'Invalid email or PIN' : 'Invalid email or password' });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Account is disabled. Contact your administrator.' });
		}

		// Verify credentials based on login mode
		if (pinOnly) {
			// Verify PIN
			const validPin = await verifyPin(pin!, user.pinHash);
			if (!validPin) {
				return fail(400, { error: 'Invalid email or PIN' });
			}
		} else {
			// Verify password
			if (!user.passwordHash) {
				return fail(400, { error: 'Password not set. Contact your administrator.' });
			}
			try {
				const validPassword = await verify(user.passwordHash, password!);
				if (!validPassword) {
					return fail(400, { error: 'Invalid email or password' });
				}
			} catch {
				return fail(400, { error: 'Invalid email or password' });
			}
		}

		const userAgent = request.headers.get('user-agent') || '';
		const ipAddress = getClientAddress();

		// Check if 2FA is enabled globally
		const twoFAEnabled = await is2FAEnabled();

		if (twoFAEnabled) {
			// Check if there's a recent session with 2FA from same device
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

			// Create session with existing 2FA time
			const session = await lucia.createSession(user.id, {
				deviceFingerprint: null,
				ipAddress,
				userAgent,
				lastActive: new Date(),
				last2faAt: recentSession[0].last2faAt
			});

			const sessionCookie = lucia.createSessionCookie(session.id);
			cookies.set(sessionCookie.name, sessionCookie.value, {
				path: '.',
				...sessionCookie.attributes
			});

			throw redirect(302, '/dashboard');
		}

		// 2FA disabled - create session directly
		const session = await lucia.createSession(user.id, {
			deviceFingerprint: null,
			ipAddress,
			userAgent,
			lastActive: new Date(),
			last2faAt: null
		});

		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		throw redirect(302, '/dashboard');
	}
};
