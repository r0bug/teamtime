import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, cashCountConfigs } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { desc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:cash-count-configs');

// GET - List cash count configs
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const configs = await db
			.select()
			.from(cashCountConfigs)
			.orderBy(desc(cashCountConfigs.createdAt));

		return json({ success: true, configs });
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Error fetching cash count configs');
		return json({ error: 'Failed to fetch configs' }, { status: 500 });
	}
};

// POST - Create a new cash count config
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { locationId, name, triggerType, fields } = body;

		// Validate required fields
		if (!locationId || !name || !triggerType || !fields) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Validate fields structure
		if (!Array.isArray(fields) || fields.length === 0) {
			return json({ error: 'Fields must be a non-empty array' }, { status: 400 });
		}

		// Insert config
		const [config] = await db
			.insert(cashCountConfigs)
			.values({
				locationId,
				name: name.trim(),
				triggerType,
				fields,
				createdBy: locals.user!.id
			})
			.returning();

		return json({ success: true, config }, { status: 201 });
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Error creating cash count config');
		return json({ error: 'Failed to create config' }, { status: 500 });
	}
};
