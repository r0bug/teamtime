import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropItems, inventoryDropPhotos, pricingDecisions, pricingDecisionPhotos } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// POST /api/inventory-drops/[id]/items/[itemId]/create-pricing - Create pricing decision from item
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: dropId, itemId } = params;

	// Get the drop
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Get the item
	const [item] = await db
		.select()
		.from(inventoryDropItems)
		.where(eq(inventoryDropItems.id, itemId))
		.limit(1);

	if (!item) {
		return json({ error: 'Item not found' }, { status: 404 });
	}

	if (item.pricingDecisionId) {
		return json({ error: 'Pricing decision already created for this item' }, { status: 400 });
	}

	// Cannot create pricing for deleted items
	if (item.deleted) {
		return json({ error: 'Cannot create pricing for a deleted item' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const {
			price,
			priceJustification,
			destination = 'store',
			ebayReason
		} = body;

		// Validation
		const priceNum = parseFloat(price);
		if (isNaN(priceNum) || priceNum <= 0) {
			return json({ error: 'Price must be a positive number' }, { status: 400 });
		}

		if (!priceJustification?.trim() || priceJustification.trim().length < 10) {
			return json({ error: 'Price justification must be at least 10 characters' }, { status: 400 });
		}

		if (destination === 'ebay' && !ebayReason?.trim()) {
			return json({ error: 'eBay reason is required when destination is eBay' }, { status: 400 });
		}

		// Get photos from the drop that are referenced by this item
		const sourcePhotoIds = item.sourcePhotoIds as string[];
		let photos: { filePath: string; originalName: string; mimeType: string; sizeBytes: number }[] = [];

		if (sourcePhotoIds.length > 0) {
			photos = await db
				.select({
					filePath: inventoryDropPhotos.filePath,
					originalName: inventoryDropPhotos.originalName,
					mimeType: inventoryDropPhotos.mimeType,
					sizeBytes: inventoryDropPhotos.sizeBytes
				})
				.from(inventoryDropPhotos)
				.where(inArray(inventoryDropPhotos.id, sourcePhotoIds));
		}

		// Create the pricing decision
		const [pricingDecision] = await db
			.insert(pricingDecisions)
			.values({
				userId: locals.user.id,
				itemDescription: item.itemDescription,
				price: priceNum.toString(),
				priceJustification: priceJustification.trim(),
				destination,
				ebayReason: destination === 'ebay' ? ebayReason.trim() : null
			})
			.returning();

		// Copy photos to pricing decision
		if (photos.length > 0) {
			await db.insert(pricingDecisionPhotos).values(
				photos.map(photo => ({
					pricingDecisionId: pricingDecision.id,
					filePath: photo.filePath,
					originalName: photo.originalName,
					mimeType: photo.mimeType,
					sizeBytes: photo.sizeBytes
				}))
			);
		}

		// Link the pricing decision to the item
		await db
			.update(inventoryDropItems)
			.set({ pricingDecisionId: pricingDecision.id })
			.where(eq(inventoryDropItems.id, itemId));

		return json({ pricingDecision }, { status: 201 });
	} catch (error) {
		console.error('Error creating pricing decision:', error);
		return json({ error: 'Failed to create pricing decision' }, { status: 500 });
	}
};
