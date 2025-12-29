import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPendingShoutouts, getRecentShoutouts, getAwardTypes } from '$lib/server/services/shoutout-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Only managers and admins can access
	if (locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		throw error(403, 'Access denied');
	}

	const [pendingShoutouts, recentShoutouts, awardTypes] = await Promise.all([
		getPendingShoutouts(),
		getRecentShoutouts(20),
		getAwardTypes(true)
	]);

	return {
		pendingShoutouts,
		recentShoutouts,
		awardTypes
	};
};
