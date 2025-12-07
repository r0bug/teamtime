import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { hashPin, validatePinFormat } from '$lib/server/auth/pin';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	const [user] = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			avatarUrl: users.avatarUrl,
			createdAt: users.createdAt
		})
		.from(users)
		.where(eq(users.id, params.id))
		.limit(1);

	if (!user) {
		throw error(404, 'User not found');
	}

	return { user };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const username = formData.get('username')?.toString().trim().toLowerCase();
		const name = formData.get('name')?.toString().trim();
		const phone = formData.get('phone')?.toString().trim() || null;
		const role = formData.get('role')?.toString() as 'manager' | 'purchaser' | 'staff';
		const isActive = formData.get('isActive') === 'on';

		if (!email || !username || !name || !role) {
			return fail(400, { error: 'All required fields must be filled' });
		}

		if (!['manager', 'purchaser', 'staff'].includes(role)) {
			return fail(400, { error: 'Invalid role' });
		}

		// Check for existing email (excluding current user)
		const [existingEmail] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existingEmail && existingEmail.id !== params.id) {
			return fail(400, { error: 'Email already exists' });
		}

		// Check for existing username (excluding current user)
		const [existingUsername] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, username))
			.limit(1);

		if (existingUsername && existingUsername.id !== params.id) {
			return fail(400, { error: 'Username already exists' });
		}

		await db
			.update(users)
			.set({
				email,
				username,
				name,
				phone,
				role,
				isActive,
				updatedAt: new Date()
			})
			.where(eq(users.id, params.id));

		return { success: true };
	},

	resetPin: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const newPin = formData.get('newPin')?.toString();

		if (!newPin || !validatePinFormat(newPin)) {
			return fail(400, { error: 'PIN must be 4-8 digits' });
		}

		const pinHash = await hashPin(newPin);

		await db
			.update(users)
			.set({ pinHash, updatedAt: new Date() })
			.where(eq(users.id, params.id));

		return { success: true, pinReset: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		// Prevent self-deletion
		if (params.id === locals.user.id) {
			return fail(400, { error: 'You cannot delete your own account' });
		}

		await db.delete(users).where(eq(users.id, params.id));

		throw redirect(302, '/admin/users');
	}
};
