import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { retryDrop } from '$lib/server/services/inventory-drops';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:inventory-drops:retry');

// POST /api/inventory-drops/[id]/retry - Retry a failed drop
export const POST: RequestHandler = async ({ locals, params }) => {
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

	// Check permissions - owner or manager can retry
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Check if drop can be retried
	if (drop.status !== 'failed') {
		return json({ error: 'Can only retry failed drops' }, { status: 400 });
	}

	if (drop.retryCount >= 3) {
		return json({ error: 'Maximum retry attempts reached' }, { status: 400 });
	}

	try {
		const jobId = await retryDrop(dropId, locals.user.id);
		return json({
			success: true,
			jobId,
			message: 'Drop queued for retry'
		});
	} catch (error) {
		log.error({ dropId, error: error instanceof Error ? error.message : String(error) }, 'Error retrying drop');
		return json({ error: 'Failed to retry drop' }, { status: 500 });
	}
};
