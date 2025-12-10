import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropItems } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// POST /api/inventory-drops/[id]/items/[itemId]/delete - Soft delete an inventory item
export const POST: RequestHandler = async ({ locals, params }) => {
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

	// Check permissions - only drop creator or managers can delete items
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Only allow deletion for completed drops
	if (drop.status !== 'completed') {
		return json({ error: 'Can only delete items from completed drops' }, { status: 400 });
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

	// Verify the item belongs to this drop
	if (item.dropId !== dropId) {
		return json({ error: 'Item does not belong to this drop' }, { status: 400 });
	}

	// Don't allow deletion if item already has a pricing decision
	if (item.pricingDecisionId) {
		return json({ error: 'Cannot delete item that already has a pricing decision' }, { status: 400 });
	}

	try {
		// Soft delete the item
		await db
			.update(inventoryDropItems)
			.set({ deleted: true })
			.where(eq(inventoryDropItems.id, itemId));

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting inventory item:', error);
		return json({ error: 'Failed to delete item' }, { status: 500 });
	}
};

// DELETE /api/inventory-drops/[id]/items/[itemId]/delete - Also support DELETE method
export const DELETE: RequestHandler = POST;
