import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// GET /api/inventory-drops/[id]/progress - Get drop processing progress
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dropId = params.id;

	const [drop] = await db
		.select({
			id: inventoryDrops.id,
			userId: inventoryDrops.userId,
			status: inventoryDrops.status,
			uploadStatus: inventoryDrops.uploadStatus,
			photosTotal: inventoryDrops.photosTotal,
			photosUploaded: inventoryDrops.photosUploaded,
			uploadError: inventoryDrops.uploadError,
			processingError: inventoryDrops.processingError,
			itemCount: inventoryDrops.itemCount,
			retryCount: inventoryDrops.retryCount,
			finalizeTaskId: inventoryDrops.finalizeTaskId,
			processedAt: inventoryDrops.processedAt,
			reviewedAt: inventoryDrops.reviewedAt
		})
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions - owner or manager can view progress
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Calculate progress percentage
	let progressPercent = 0;
	let progressStage: 'uploading' | 'processing' | 'completed' | 'failed' = 'uploading';

	if (drop.uploadStatus === 'failed') {
		progressStage = 'failed';
		progressPercent = 0;
	} else if (drop.status === 'failed') {
		progressStage = 'failed';
		progressPercent = 50; // Upload succeeded but processing failed
	} else if (drop.status === 'completed') {
		progressStage = 'completed';
		progressPercent = 100;
	} else if (drop.status === 'processing') {
		progressStage = 'processing';
		progressPercent = 75; // Processing in progress
	} else if (drop.uploadStatus === 'completed') {
		progressStage = 'processing';
		progressPercent = 50; // Upload complete, waiting for processing
	} else if (drop.uploadStatus === 'uploading') {
		progressStage = 'uploading';
		progressPercent = drop.photosTotal > 0
			? Math.round((drop.photosUploaded / drop.photosTotal) * 50)
			: 0;
	}

	return json({
		progress: {
			stage: progressStage,
			percent: progressPercent,
			status: drop.status,
			uploadStatus: drop.uploadStatus,
			photosTotal: drop.photosTotal,
			photosUploaded: drop.photosUploaded,
			uploadError: drop.uploadError,
			processingError: drop.processingError,
			itemCount: drop.itemCount,
			retryCount: drop.retryCount,
			finalizeTaskId: drop.finalizeTaskId,
			isComplete: drop.status === 'completed',
			isFailed: drop.status === 'failed' || drop.uploadStatus === 'failed',
			canRetry: drop.status === 'failed' && drop.retryCount < 3
		}
	});
};
