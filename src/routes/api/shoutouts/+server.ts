import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createShoutout,
	getRecentShoutouts,
	getShoutoutsForUser,
	getAwardTypes,
	type ShoutoutCategory
} from '$lib/server/services/shoutout-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:shoutouts');

/**
 * GET /api/shoutouts
 * Get recent public shoutouts or shoutouts for a specific user
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const userId = url.searchParams.get('userId');
	const limit = parseInt(url.searchParams.get('limit') || '20');

	try {
		let shoutouts;

		if (userId) {
			// Get shoutouts for a specific user
			shoutouts = await getShoutoutsForUser(userId, { limit });
		} else {
			// Get recent public shoutouts
			shoutouts = await getRecentShoutouts(limit);
		}

		return json({ shoutouts });
	} catch (err) {
		log.error({ error: err }, 'Failed to get shoutouts');
		throw error(500, 'Failed to get shoutouts');
	}
};

/**
 * POST /api/shoutouts
 * Create a new shoutout
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = locals.user;
	const isManager = user.role === 'admin' || user.role === 'manager';

	try {
		const body = await request.json();
		const { recipientId, awardTypeId, category, title, description, sourceType, sourceId } = body;

		// Validate required fields
		if (!recipientId) {
			throw error(400, 'recipientId is required');
		}
		if (!title) {
			throw error(400, 'title is required');
		}
		if (!category) {
			throw error(400, 'category is required');
		}

		// Prevent self-shoutouts
		if (recipientId === user.id) {
			throw error(400, 'You cannot give a shoutout to yourself');
		}

		// Check if award type is manager-only
		if (awardTypeId) {
			const awardTypes = await getAwardTypes(true);
			const awardType = awardTypes.find(t => t.id === awardTypeId);
			if (awardType?.managerOnly && !isManager) {
				throw error(403, 'This award type is only available to managers');
			}
		}

		const shoutout = await createShoutout({
			recipientId,
			nominatorId: user.id,
			awardTypeId,
			category: category as ShoutoutCategory,
			title,
			description,
			isManagerAward: isManager,
			isAiGenerated: false,
			sourceType,
			sourceId
		});

		log.info({
			shoutoutId: shoutout.id,
			nominatorId: user.id,
			recipientId,
			isManagerAward: isManager
		}, 'Shoutout created via API');

		return json({ shoutout }, { status: 201 });
	} catch (err) {
		if (err instanceof Response) throw err;
		log.error({ error: err }, 'Failed to create shoutout');
		throw error(500, 'Failed to create shoutout');
	}
};
