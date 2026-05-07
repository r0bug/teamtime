import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, users } from '$lib/server/db';
import { hashPin } from '$lib/server/auth/pin';
import { verify } from '@node-rs/argon2';
import { createLogger } from '$lib/server/logger';

const log = createLogger('vendor:profile');

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();
	return { vendor };
};

export const actions: Actions = {
	changePassword: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const data = await request.formData();
		const currentPassword = (data.get('currentPassword') as string) ?? '';
		const newPassword = (data.get('newPassword') as string) ?? '';
		const confirmPassword = (data.get('confirmPassword') as string) ?? '';

		if (!currentPassword) return fail(400, { error: 'Current password is required' });
		if (newPassword.length < 8) return fail(400, { error: 'New password must be at least 8 characters' });
		if (newPassword !== confirmPassword) return fail(400, { error: 'Passwords do not match' });

		const [u] = await db.select().from(users).where(eq(users.id, locals.user.id)).limit(1);
		if (!u || !u.passwordHash) return fail(400, { error: 'No password is set on this account' });

		const ok = await verify(u.passwordHash, currentPassword).catch(() => false);
		if (!ok) return fail(400, { error: 'Current password is incorrect' });

		const newHash = await hashPin(newPassword);
		await db
			.update(users)
			.set({ passwordHash: newHash, updatedAt: new Date() })
			.where(eq(users.id, locals.user.id));

		log.info({ userId: locals.user.id }, 'Vendor changed password');
		return { success: true };
	}
};
