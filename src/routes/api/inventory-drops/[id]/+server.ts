import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, users, pricingDecisions } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// GET /api/inventory-drops/[id] - Get single inventory drop with details
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dropId = params.id;

	// Get the drop
	const [drop] = await db
		.select({
			id: inventoryDrops.id,
			userId: inventoryDrops.userId,
			userName: users.name,
			description: inventoryDrops.description,
			pickNotes: inventoryDrops.pickNotes,
			status: inventoryDrops.status,
			itemCount: inventoryDrops.itemCount,
			processingError: inventoryDrops.processingError,
			processedAt: inventoryDrops.processedAt,
			createdAt: inventoryDrops.createdAt
		})
		.from(inventoryDrops)
		.leftJoin(users, eq(inventoryDrops.userId, users.id))
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions - non-managers can only view their own drops
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Get photos
	const photos = await db
		.select()
		.from(inventoryDropPhotos)
		.where(eq(inventoryDropPhotos.dropId, dropId))
		.orderBy(inventoryDropPhotos.orderIndex);

	// Get items with their pricing decisions
	const items = await db
		.select({
			id: inventoryDropItems.id,
			itemDescription: inventoryDropItems.itemDescription,
			suggestedPrice: inventoryDropItems.suggestedPrice,
			confidenceScore: inventoryDropItems.confidenceScore,
			sourcePhotoIds: inventoryDropItems.sourcePhotoIds,
			pricingDecisionId: inventoryDropItems.pricingDecisionId,
			createdAt: inventoryDropItems.createdAt,
			// Include pricing decision info if exists
			pricingPrice: pricingDecisions.price,
			pricingDestination: pricingDecisions.destination
		})
		.from(inventoryDropItems)
		.leftJoin(pricingDecisions, eq(inventoryDropItems.pricingDecisionId, pricingDecisions.id))
		.where(eq(inventoryDropItems.dropId, dropId));

	return json({
		drop: {
			...drop,
			photos,
			items
		}
	});
};

// DELETE /api/inventory-drops/[id] - Delete inventory drop (only pending drops)
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dropId = params.id;

	// Get the drop
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions - owner or manager can delete
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Only pending drops can be deleted
	if (drop.status !== 'pending') {
		return json({ error: 'Only pending drops can be deleted' }, { status: 400 });
	}

	await db.delete(inventoryDrops).where(eq(inventoryDrops.id, dropId));

	return json({ success: true });
};
