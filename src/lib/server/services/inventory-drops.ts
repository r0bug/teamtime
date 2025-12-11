// Inventory Drops Service - handles async drop processing workflow
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, tasks, users } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { createJob } from '$lib/server/jobs/queue';
import { createLogger } from '$lib/server/logger';

const log = createLogger('server:inventory-drops');

export interface CreateDropInput {
	userId: string;
	description: string;
	pickNotes?: string | null;
	photos: Array<{
		filePath: string;
		originalName: string;
		mimeType: string;
		sizeBytes: number;
	}>;
}

export interface DropProgress {
	id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
	photosTotal: number;
	photosUploaded: number;
	uploadError: string | null;
	processingError: string | null;
	itemCount: number | null;
	retryCount: number;
}

// Create a new inventory drop and queue it for processing
export async function createDrop(input: CreateDropInput): Promise<{
	drop: typeof inventoryDrops.$inferSelect;
	jobId: string;
}> {
	// Create the drop record with upload tracking
	const [drop] = await db
		.insert(inventoryDrops)
		.values({
			userId: input.userId,
			description: input.description.trim(),
			pickNotes: input.pickNotes?.trim() || null,
			status: 'pending',
			uploadStatus: 'completed', // Photos are already uploaded when we receive them
			photosTotal: input.photos.length,
			photosUploaded: input.photos.length
		})
		.returning();

	// Add photos to the database
	if (input.photos.length > 0) {
		await db.insert(inventoryDropPhotos).values(
			input.photos.map((photo, index) => ({
				dropId: drop.id,
				filePath: photo.filePath,
				originalName: photo.originalName,
				mimeType: photo.mimeType,
				sizeBytes: photo.sizeBytes,
				orderIndex: index
			}))
		);
	}

	// Queue the processing job
	const job = await createJob('inventory_drop_process', {
		dropId: drop.id,
		userId: input.userId
	}, {
		priority: 10 // Higher priority for new drops
	});

	log.info('Created drop with processing job', { dropId: drop.id, jobId: job.id });

	return { drop, jobId: job.id };
}

// Get drop progress for UI polling
export async function getDropProgress(dropId: string): Promise<DropProgress | null> {
	const [drop] = await db
		.select({
			id: inventoryDrops.id,
			status: inventoryDrops.status,
			uploadStatus: inventoryDrops.uploadStatus,
			photosTotal: inventoryDrops.photosTotal,
			photosUploaded: inventoryDrops.photosUploaded,
			uploadError: inventoryDrops.uploadError,
			processingError: inventoryDrops.processingError,
			itemCount: inventoryDrops.itemCount,
			retryCount: inventoryDrops.retryCount
		})
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	return drop ?? null;
}

// Update upload progress
export async function updateUploadProgress(
	dropId: string,
	photosUploaded: number,
	error?: string
): Promise<void> {
	await db
		.update(inventoryDrops)
		.set({
			photosUploaded,
			uploadStatus: error ? 'failed' : (photosUploaded > 0 ? 'uploading' : 'pending'),
			uploadError: error || null
		})
		.where(eq(inventoryDrops.id, dropId));
}

// Mark upload as complete
export async function markUploadComplete(dropId: string): Promise<void> {
	const [drop] = await db
		.select({ photosTotal: inventoryDrops.photosTotal })
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) return;

	await db
		.update(inventoryDrops)
		.set({
			uploadStatus: 'completed',
			photosUploaded: drop.photosTotal,
			uploadError: null
		})
		.where(eq(inventoryDrops.id, dropId));
}

// Update processing status
export async function updateProcessingStatus(
	dropId: string,
	status: 'pending' | 'processing' | 'completed' | 'failed',
	data?: {
		itemCount?: number;
		error?: string;
	}
): Promise<void> {
	const updates: Record<string, unknown> = { status };

	if (data?.itemCount !== undefined) {
		updates.itemCount = data.itemCount;
	}

	if (data?.error !== undefined) {
		updates.processingError = data.error;
	}

	if (status === 'completed') {
		updates.processedAt = new Date();
	}

	if (status === 'failed') {
		updates.retryCount = sql`${inventoryDrops.retryCount} + 1`;
	}

	await db
		.update(inventoryDrops)
		.set(updates)
		.where(eq(inventoryDrops.id, dropId));
}

// Create finalize task when processing completes
export async function createFinalizeTask(
	dropId: string,
	userId: string
): Promise<string> {
	// Get drop details
	const [drop] = await db
		.select({
			description: inventoryDrops.description,
			itemCount: inventoryDrops.itemCount
		})
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		throw new Error('Drop not found');
	}

	// Get item confidence summary
	const items = await db
		.select({
			confidenceScore: inventoryDropItems.confidenceScore
		})
		.from(inventoryDropItems)
		.where(eq(inventoryDropItems.dropId, dropId));

	const highConfidence = items.filter(i => parseFloat(i.confidenceScore ?? '0') >= 0.8).length;
	const medConfidence = items.filter(i => {
		const score = parseFloat(i.confidenceScore ?? '0');
		return score >= 0.5 && score < 0.8;
	}).length;
	const lowConfidence = items.filter(i => parseFloat(i.confidenceScore ?? '0') < 0.5).length;

	// Create the task
	const [task] = await db
		.insert(tasks)
		.values({
			title: `Finalize Inventory Drop - ${drop.description.substring(0, 50)}`,
			description: `Review and finalize the inventory drop.

**Items Identified:** ${drop.itemCount ?? 0}
- High confidence: ${highConfidence}
- Medium confidence: ${medConfidence}
- Low confidence: ${lowConfidence}

**Actions needed:**
1. Review identified items for accuracy
2. Remove any incorrect or duplicate items
3. Create pricing decisions for items
4. Mark drop as reviewed when done

[View Drop](/inventory/drops/${dropId})`,
			assignedTo: userId,
			priority: 'medium',
			source: 'inventory_drop',
			linkedEventId: dropId,
			createdBy: userId,
			status: 'not_started'
		})
		.returning();

	// Link task to drop
	await db
		.update(inventoryDrops)
		.set({ finalizeTaskId: task.id })
		.where(eq(inventoryDrops.id, dropId));

	log.info('Created finalize task for drop', { taskId: task.id, dropId });

	return task.id;
}

// Retry a failed drop
export async function retryDrop(dropId: string, userId: string): Promise<string> {
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		throw new Error('Drop not found');
	}

	if (drop.status !== 'failed') {
		throw new Error('Can only retry failed drops');
	}

	// Reset status
	await db
		.update(inventoryDrops)
		.set({
			status: 'pending',
			processingError: null
		})
		.where(eq(inventoryDrops.id, dropId));

	// Create new processing job
	const job = await createJob('inventory_drop_process', {
		dropId,
		userId
	}, {
		priority: 5 // Slightly lower priority for retries
	});

	log.info('Retrying drop with new job', { dropId, jobId: job.id });

	return job.id;
}

// Cancel a pending drop
export async function cancelDrop(dropId: string): Promise<void> {
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		throw new Error('Drop not found');
	}

	if (!['pending', 'failed'].includes(drop.status)) {
		throw new Error('Can only cancel pending or failed drops');
	}

	// Delete the drop (cascade will handle photos)
	await db.delete(inventoryDrops).where(eq(inventoryDrops.id, dropId));

	log.info('Cancelled drop', { dropId });
}
