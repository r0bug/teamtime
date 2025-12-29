import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAwardTypes } from '$lib/server/services/shoutout-service';

/**
 * GET /api/award-types
 * Get available award types for shoutouts
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = locals.user;
	const isManager = user.role === 'admin' || user.role === 'manager';

	// Include manager-only award types if user is a manager
	const includeManagerOnly = url.searchParams.get('includeManagerOnly') !== 'false' && isManager;

	const awardTypes = await getAwardTypes(includeManagerOnly);

	return json({ awardTypes });
};
