import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, locations } from '$lib/server/db';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	const allLocations = await db
		.select()
		.from(locations)
		.orderBy(desc(locations.createdAt));

	return { locations: allLocations };
};
