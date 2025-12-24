/**
 * Seed achievements endpoint
 * POST /api/admin/gamification/seed
 *
 * Seeds the default achievements into the database.
 * Requires admin authentication or cron secret.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { seedAchievements } from '$lib/server/services/achievements-service';
import { CRON_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ locals, url }) => {
	// Check authentication - either admin user or cron secret
	const secret = url.searchParams.get('secret');

	if (secret !== CRON_SECRET) {
		// Must be an authenticated admin
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			throw error(401, 'Unauthorized');
		}
	}

	try {
		const result = await seedAchievements();

		return json({
			success: true,
			message: 'Achievements seeded successfully',
			created: result.created,
			existing: result.existing
		});
	} catch (err) {
		console.error('Error seeding achievements:', err);
		throw error(500, 'Failed to seed achievements');
	}
};
