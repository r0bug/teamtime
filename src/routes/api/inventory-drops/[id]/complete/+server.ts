import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:inventory-drops:complete');

// POST /api/inventory-drops/[id]/complete - Mark a drop as reviewed
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: dropId } = params;

	// Get the drop
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions - only drop creator or managers can complete review
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Only allow completion for completed drops (processing is done)
	if (drop.status !== 'completed') {
		return json({ error: 'Can only mark drops as reviewed after AI processing is complete' }, { status: 400 });
	}

	// Check if already reviewed
	if (drop.reviewedAt) {
		return json({ error: 'Drop has already been reviewed' }, { status: 400 });
	}

	try {
		// Mark the drop as reviewed
		const [updated] = await db
			.update(inventoryDrops)
			.set({ reviewedAt: new Date() })
			.where(eq(inventoryDrops.id, dropId))
			.returning();

		return json({
			success: true,
			reviewedAt: updated.reviewedAt?.toISOString()
		});
	} catch (error) {
		log.error('Error completing drop review', { dropId, error: error instanceof Error ? error.message : String(error) });
		return json({ error: 'Failed to complete review' }, { status: 500 });
	}
};
