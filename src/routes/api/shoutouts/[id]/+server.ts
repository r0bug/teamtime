import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getShoutoutWithDetails } from '$lib/server/services/shoutout-service';

/**
 * GET /api/shoutouts/[id]
 * Get a specific shoutout by ID
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const shoutout = await getShoutoutWithDetails(params.id);

	if (!shoutout) {
		throw error(404, 'Shoutout not found');
	}

	return json({ shoutout });
};
