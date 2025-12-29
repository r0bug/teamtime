import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveShoutout } from '$lib/server/services/shoutout-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:shoutouts:approve');

/**
 * POST /api/shoutouts/[id]/approve
 * Approve a pending shoutout (manager action)
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = locals.user;

	// Only managers and admins can approve
	if (user.role !== 'admin' && user.role !== 'manager') {
		throw error(403, 'Only managers can approve shoutouts');
	}

	try {
		const shoutout = await approveShoutout(params.id, user.id);

		if (!shoutout) {
			throw error(404, 'Shoutout not found or not pending');
		}

		log.info({
			shoutoutId: params.id,
			approverId: user.id,
			pointsAwarded: shoutout.pointsAwarded
		}, 'Shoutout approved');

		return json({ shoutout });
	} catch (err) {
		if (err instanceof Response) throw err;
		log.error({ error: err, shoutoutId: params.id }, 'Failed to approve shoutout');
		throw error(500, 'Failed to approve shoutout');
	}
};
