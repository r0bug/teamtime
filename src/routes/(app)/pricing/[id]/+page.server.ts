import type { PageServerLoad } from './$types';
import { db, pricingDecisions, pricingDecisionPhotos, users, locations, tasks } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const { id } = params;

	// Fetch the pricing decision
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
		throw error(404, 'Pricing decision not found');
	}

	// Check access - non-managers can only view their own decisions
	const isManager = user.role === 'manager' || user.role === 'admin';
	if (!isManager && decision.userId !== user.id) {
		throw error(403, 'Access denied');
	}

	// Fetch photos
	const photos = await db
		.select()
		.from(pricingDecisionPhotos)
		.where(eq(pricingDecisionPhotos.pricingDecisionId, id));

	// Fetch eBay task if present
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

	return {
		decision: {
			...decision,
			photos,
			ebayTask
		},
		isManager
	};
};
