import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPendingShoutouts, getPendingShoutoutCount } from '$lib/server/services/shoutout-service';

/**
 * GET /api/shoutouts/pending
 * Get pending shoutouts awaiting approval (manager view)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = locals.user;

	// Only managers and admins can view pending
	if (user.role !== 'admin' && user.role !== 'manager') {
		throw error(403, 'Only managers can view pending shoutouts');
	}

	const countOnly = url.searchParams.get('countOnly') === 'true';

	if (countOnly) {
		const count = await getPendingShoutoutCount();
		return json({ count });
	}

	const shoutouts = await getPendingShoutouts();
	return json({ shoutouts });
};
