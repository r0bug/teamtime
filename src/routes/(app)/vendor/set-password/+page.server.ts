import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$lib/server/db';
import { hashPin } from '$lib/server/auth/pin';
import { createLogger } from '$lib/server/logger';

const log = createLogger('routes:vendor:set-password');

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	// If they're already past the must-change flag, no need to be here.
	if (!locals.user.mustChangePassword) throw redirect(302, '/vendor');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		// This route is only for users still on a temp password. Anyone whose
		// must_change_password flag is already cleared must go through the
		// regular change-password flow (which requires the current password).
		if (!locals.user.mustChangePassword) return fail(403, { error: 'Use the regular change-password flow' });

		const form = await request.formData();
		const password = (form.get('password') as string) ?? '';
		const confirm = (form.get('confirm') as string) ?? '';

		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match' });
		}

		const passwordHash = await hashPin(password);
		await db
			.update(users)
			.set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
			.where(eq(users.id, locals.user.id));

		log.info({ userId: locals.user.id }, 'Vendor set new password on first login');
		throw redirect(303, '/vendor');
	}
};
