import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropItems } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:inventory-drops:items');

// POST /api/inventory-drops/[id]/items - Add a new item manually
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: dropId } = params;

	try {
		// Get the drop
		const [drop] = await db
			.select()
			.from(inventoryDrops)
			.where(eq(inventoryDrops.id, dropId))
			.limit(1);

		if (!drop) {
			return json({ error: 'Drop not found' }, { status: 404 });
		}

		// Check if drop is completed and not yet reviewed
		if (drop.status !== 'completed') {
			return json({ error: 'Can only add items to completed drops' }, { status: 400 });
		}

		if (drop.reviewedAt) {
			return json({ error: 'Cannot add items to reviewed drops' }, { status: 400 });
		}

		// Parse request body
		const body = await request.json();
		const { description, suggestedPrice, sourcePhotoIds } = body;

		if (!description || typeof description !== 'string' || description.trim().length < 3) {
			return json({ error: 'Description must be at least 3 characters' }, { status: 400 });
		}

		// Create the item
		const [item] = await db
			.insert(inventoryDropItems)
			.values({
				dropId,
				itemDescription: description.trim(),
				suggestedPrice: suggestedPrice ? String(suggestedPrice) : null,
				sourcePhotoIds: sourcePhotoIds && sourcePhotoIds.length > 0 ? sourcePhotoIds : [],
				confidenceScore: '1.0', // Manual items have 100% confidence
				deleted: false
			})
			.returning();

		// Update the item count on the drop
		await db
			.update(inventoryDrops)
			.set({
				itemCount: sql`COALESCE(${inventoryDrops.itemCount}, 0) + 1`
			})
			.where(eq(inventoryDrops.id, dropId));

		log.info({ dropId, itemId: item.id, userId: user.id }, 'Item added manually to drop');

		return json({
			success: true,
			item: {
				id: item.id,
				description: item.itemDescription,
				suggestedPrice: item.suggestedPrice,
				sourcePhotoIds: item.sourcePhotoIds
			}
		});
	} catch (error) {
		log.error({ error, dropId, userId: user.id }, 'Failed to add item to drop');
		return json(
			{ error: 'Failed to add item' },
			{ status: 500 }
		);
	}
};
