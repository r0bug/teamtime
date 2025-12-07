import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { hashPin, verifyPin, validatePinFormat } from '$lib/server/auth/pin';

export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user };
};

export const actions: Actions = {
	updateProfile: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const phone = formData.get('phone')?.toString().trim();

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		await db
			.update(users)
			.set({ name, phone: phone || null, updatedAt: new Date() })
			.where(eq(users.id, locals.user.id));

		return { success: true };
	},

	changePin: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const currentPin = formData.get('currentPin')?.toString();
		const newPin = formData.get('newPin')?.toString();
		const confirmPin = formData.get('confirmPin')?.toString();

		if (!currentPin || !newPin || !confirmPin) {
			return fail(400, { error: 'All fields are required' });
		}

		if (newPin !== confirmPin) {
			return fail(400, { error: 'New PINs do not match' });
		}

		if (!validatePinFormat(newPin)) {
			return fail(400, { error: 'PIN must be 4-8 digits' });
		}

		// Get current user with pin hash
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, locals.user.id))
			.limit(1);

		if (!user) {
			return fail(404, { error: 'User not found' });
		}

		// Verify current PIN
		const validPin = await verifyPin(currentPin, user.pinHash);
		if (!validPin) {
			return fail(400, { error: 'Current PIN is incorrect' });
		}

		// Update PIN
		const newPinHash = await hashPin(newPin);
		await db
			.update(users)
			.set({ pinHash: newPinHash, updatedAt: new Date() })
			.where(eq(users.id, locals.user.id));

		return { success: true, message: 'PIN changed successfully' };
	}
};
