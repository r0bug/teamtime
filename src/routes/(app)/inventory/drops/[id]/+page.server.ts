import type { PageServerLoad } from './$types';
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, users, pricingDecisions, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const userIsManager = isManager(user);
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
			uploadStatus: inventoryDrops.uploadStatus,
			photosTotal: inventoryDrops.photosTotal,
			photosUploaded: inventoryDrops.photosUploaded,
			uploadError: inventoryDrops.uploadError,
			itemCount: inventoryDrops.itemCount,
			processingError: inventoryDrops.processingError,
			retryCount: inventoryDrops.retryCount,
			finalizeTaskId: inventoryDrops.finalizeTaskId,
			processedAt: inventoryDrops.processedAt,
			reviewedAt: inventoryDrops.reviewedAt,
			createdAt: inventoryDrops.createdAt
		})
		.from(inventoryDrops)
		.leftJoin(users, eq(inventoryDrops.userId, users.id))
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		throw error(404, 'Drop not found');
	}

	// Check permissions
	if (!userIsManager && drop.userId !== user.id) {
		throw error(403, 'Access denied');
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
			deleted: inventoryDropItems.deleted,
			createdAt: inventoryDropItems.createdAt,
			// Include pricing decision info if exists
			pricingPrice: pricingDecisions.price,
			pricingDestination: pricingDecisions.destination
		})
		.from(inventoryDropItems)
		.leftJoin(pricingDecisions, eq(inventoryDropItems.pricingDecisionId, pricingDecisions.id))
		.where(eq(inventoryDropItems.dropId, dropId));

	// Get locations for create-pricing modal
	const locationsList = await db.select().from(locations);

	return {
		drop: {
			...drop,
			photos,
			items
		},
		locations: locationsList,
		isManager: userIsManager
	};
};
