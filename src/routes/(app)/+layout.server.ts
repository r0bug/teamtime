import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Fetch additional user data not stored in session
	const [userData] = await db
		.select({ canListOnEbay: users.canListOnEbay })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

	return {
		user: locals.user,
		canListOnEbay: userData?.canListOnEbay || false
	};
};
