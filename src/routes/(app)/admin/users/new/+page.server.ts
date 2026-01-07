import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { hashPin, validatePinFormat, generatePin } from '$lib/server/auth/pin';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Generate a random PIN for the new user
	const suggestedPin = generatePin();

	// Get all active locations for the dropdown
	const allLocations = await db
		.select({ id: locations.id, name: locations.name })
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	return { suggestedPin, locations: allLocations };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const username = formData.get('username')?.toString().trim().toLowerCase();
		const name = formData.get('name')?.toString().trim();
		const phone = formData.get('phone')?.toString().trim() || null;
		const role = formData.get('role')?.toString() as 'manager' | 'purchaser' | 'staff';
		const pin = formData.get('pin')?.toString();
		const primaryLocationId = formData.get('primaryLocationId')?.toString() || null;

		// Validation
		if (!email || !username || !name || !role || !pin) {
			return fail(400, { error: 'All required fields must be filled' });
		}

		if (!validatePinFormat(pin)) {
			return fail(400, { error: 'PIN must be 4-8 digits' });
		}

		if (!['manager', 'purchaser', 'staff'].includes(role)) {
			return fail(400, { error: 'Invalid role' });
		}

		// Check for existing email
		const [existingEmail] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existingEmail) {
			return fail(400, { error: 'Email already exists' });
		}

		// Check for existing username
		const [existingUsername] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, username))
			.limit(1);

		if (existingUsername) {
			return fail(400, { error: 'Username already exists' });
		}

		// Hash PIN and create user
		const pinHash = await hashPin(pin);

		await db.insert(users).values({
			email,
			username,
			name,
			phone,
			role,
			pinHash,
			primaryLocationId,
			isActive: true
		});

		throw redirect(302, '/admin/users');
	}
};
