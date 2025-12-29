import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rejectShoutout } from '$lib/server/services/shoutout-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:shoutouts:reject');

/**
 * POST /api/shoutouts/[id]/reject
 * Reject a pending shoutout (manager action)
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = locals.user;

	// Only managers and admins can reject
	if (user.role !== 'admin' && user.role !== 'manager') {
		throw error(403, 'Only managers can reject shoutouts');
	}

	try {
		const body = await request.json().catch(() => ({}));
		const reason = body.reason as string | undefined;

		const shoutout = await rejectShoutout(params.id, user.id, reason);

		if (!shoutout) {
			throw error(404, 'Shoutout not found or not pending');
		}

		log.info({
			shoutoutId: params.id,
			rejectorId: user.id,
			reason
		}, 'Shoutout rejected');

		return json({ shoutout });
	} catch (err) {
		if (err instanceof Response) throw err;
		log.error({ error: err, shoutoutId: params.id }, 'Failed to reject shoutout');
		throw error(500, 'Failed to reject shoutout');
	}
};
