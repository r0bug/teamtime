import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, cashCounts, cashCountConfigs } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:cash-counts');

// GET - List cash counts (recent)
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const locationId = url.searchParams.get('locationId');
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);

	try {
		const baseQuery = db
			.select()
			.from(cashCounts)
			.orderBy(desc(cashCounts.submittedAt))
			.limit(limit);

		const counts = locationId
			? await baseQuery.where(eq(cashCounts.locationId, locationId))
			: await baseQuery;

		return json({ success: true, cashCounts: counts });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error fetching cash counts');
		return json({ error: 'Failed to fetch cash counts' }, { status: 500 });
	}
};

// POST - Submit a new cash count
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { configId, locationId, timeEntryId, values, totalAmount, notes } = body;

		// Validate required fields
		if (!configId || !locationId || !values || totalAmount === undefined) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Verify config exists
		const [config] = await db
			.select()
			.from(cashCountConfigs)
			.where(eq(cashCountConfigs.id, configId))
			.limit(1);

		if (!config) {
			return json({ error: 'Cash count configuration not found' }, { status: 404 });
		}

		// Insert cash count
		const [cashCount] = await db
			.insert(cashCounts)
			.values({
				configId,
				userId: locals.user.id,
				locationId,
				timeEntryId: timeEntryId || null,
				values,
				totalAmount: totalAmount.toString(),
				notes: notes || null
			})
			.returning();

		return json({ success: true, cashCount }, { status: 201 });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error creating cash count');
		return json({ error: 'Failed to create cash count' }, { status: 500 });
	}
};
