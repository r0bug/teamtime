import type { PageServerLoad } from './$types';
import { db, locations } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	// Fetch all active locations
	const allLocations = await db.query.locations.findMany({
		where: (locations, { eq }) => eq(locations.isActive, true)
	});

	return {
		locations: allLocations
	};
};
