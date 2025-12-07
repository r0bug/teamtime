import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager, isAdmin } from '$lib/server/auth/roles';
import { hashPin, validatePinFormat } from '$lib/server/auth/pin';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			username: users.username,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			hourlyRate: users.hourlyRate,
			twoFactorEnabled: users.twoFactorEnabled,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(users.name);

	return {
		isAdmin: isAdmin(locals.user),
		users: allUsers
	};
};

export const actions: Actions = {
	updateUser: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const name = formData.get('name') as string;
		const email = formData.get('email') as string;
		const phone = formData.get('phone') as string;
		const role = formData.get('role') as string;
		const hourlyRate = formData.get('hourlyRate') as string;
		const isActive = formData.get('isActive') === 'true';

		if (!userId || !name || !email) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			await db
				.update(users)
				.set({
					name,
					email,
					phone: phone || null,
					role: role as 'admin' | 'manager' | 'purchaser' | 'staff',
					hourlyRate: hourlyRate ? hourlyRate : null,
					isActive,
					updatedAt: new Date()
				})
				.where(eq(users.id, userId));

			return { success: true, message: 'User updated successfully' };
		} catch (error) {
			console.error('Error updating user:', error);
			return fail(500, { error: 'Failed to update user' });
		}
	},

	toggleTwoFactor: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Only admins can toggle 2FA' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const enabled = formData.get('enabled') === 'true';

		if (!userId) {
			return fail(400, { error: 'User ID required' });
		}

		try {
			await db
				.update(users)
				.set({
					twoFactorEnabled: enabled,
					updatedAt: new Date()
				})
				.where(eq(users.id, userId));

			return { success: true, message: '2FA setting updated successfully' };
		} catch (error) {
			console.error('Error toggling 2FA:', error);
			return fail(500, { error: 'Failed to update 2FA setting' });
		}
	},

	createUser: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const email = formData.get('email') as string;
		const username = formData.get('username') as string;
		const phone = formData.get('phone') as string;
		const role = formData.get('role') as string;
		const hourlyRate = formData.get('hourlyRate') as string;
		const pin = formData.get('pin') as string;

		if (!name || !email || !username || !pin) {
			return fail(400, { error: 'Name, email, username, and PIN are required' });
		}

		if (!validatePinFormat(pin)) {
			return fail(400, { error: 'PIN must be 4-8 digits' });
		}

		try {
			const pinHash = await hashPin(pin);

			await db.insert(users).values({
				name,
				email,
				username,
				phone: phone || null,
				role: (role || 'staff') as 'admin' | 'manager' | 'purchaser' | 'staff',
				hourlyRate: hourlyRate || null,
				pinHash,
				twoFactorEnabled: true
			});

			return { success: true, message: 'User created successfully' };
		} catch (error: any) {
			console.error('Error creating user:', error);
			if (error.code === '23505') {
				return fail(400, { error: 'Email or username already exists' });
			}
			return fail(500, { error: 'Failed to create user' });
		}
	}
};
