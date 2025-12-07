import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, users, twoFactorCodes } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { generate2FACode } from '$lib/server/auth/pin';
import { sendPinResetCode } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().toLowerCase().trim();

		if (!email) {
			return fail(400, { error: 'Email is required' });
		}

		// Find user (don't reveal if user exists)
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		// Always return success to prevent email enumeration
		if (user && user.isActive) {
			const code = generate2FACode();
			const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

			await db.insert(twoFactorCodes).values({
				userId: user.id,
				code,
				expiresAt
			});

			await sendPinResetCode(email, code);
		}

		// Add delay to prevent timing attacks
		await new Promise((r) => setTimeout(r, 500));

		return { success: true };
	}
};
