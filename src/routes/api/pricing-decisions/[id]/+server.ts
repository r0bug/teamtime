import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, pricingDecisions, pricingDecisionPhotos, users, locations, tasks } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:pricing-decisions:id');

// GET /api/pricing-decisions/[id] - Get a single pricing decision
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const [decision] = await db
			.select({
				id: pricingDecisions.id,
				userId: pricingDecisions.userId,
				userName: users.name,
				itemDescription: pricingDecisions.itemDescription,
				price: pricingDecisions.price,
				priceJustification: pricingDecisions.priceJustification,
				destination: pricingDecisions.destination,
				ebayReason: pricingDecisions.ebayReason,
				ebayTaskId: pricingDecisions.ebayTaskId,
				locationId: pricingDecisions.locationId,
				locationName: locations.name,
				lat: pricingDecisions.lat,
				lng: pricingDecisions.lng,
				address: pricingDecisions.address,
				pricedAt: pricingDecisions.pricedAt,
				createdAt: pricingDecisions.createdAt
			})
			.from(pricingDecisions)
			.leftJoin(users, eq(pricingDecisions.userId, users.id))
			.leftJoin(locations, eq(pricingDecisions.locationId, locations.id))
			.where(eq(pricingDecisions.id, id))
			.limit(1);

		if (!decision) {
			return json({ error: 'Pricing decision not found' }, { status: 404 });
		}

		// Check access - non-managers can only view their own decisions
		const isManager = locals.user.role === 'manager' || locals.user.role === 'admin';
		if (!isManager && decision.userId !== locals.user.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		// Get photos
		const photos = await db
			.select()
			.from(pricingDecisionPhotos)
			.where(eq(pricingDecisionPhotos.pricingDecisionId, id));

		// Get eBay task details if present
		let ebayTask = null;
		if (decision.ebayTaskId) {
			const [task] = await db
				.select({
					id: tasks.id,
					title: tasks.title,
					status: tasks.status,
					assignedTo: tasks.assignedTo,
					assigneeName: users.name
				})
				.from(tasks)
				.leftJoin(users, eq(tasks.assignedTo, users.id))
				.where(eq(tasks.id, decision.ebayTaskId))
				.limit(1);
			ebayTask = task || null;
		}

		return json({
			decision: {
				...decision,
				photos,
				ebayTask
			}
		});
	} catch (error) {
		log.error({ error, userId: locals.user.id, decisionId: id }, 'Error fetching pricing decision');
		return json({ error: 'Failed to fetch pricing decision' }, { status: 500 });
	}
};

// Note: No PUT/PATCH/DELETE handlers - pricing decisions are immutable for audit purposes
