import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, users } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// GET /api/inventory-drops - List inventory drops
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const status = url.searchParams.get('status');

	// Build conditions
	const conditions = [];

	// Non-managers can only see their own drops
	if (!isManager(locals.user)) {
		conditions.push(eq(inventoryDrops.userId, locals.user.id));
	}

	// Filter by status if provided
	if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
		conditions.push(eq(inventoryDrops.status, status as 'pending' | 'processing' | 'completed' | 'failed'));
	}

	const drops = await db
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
			itemCount: inventoryDrops.itemCount,
			processingError: inventoryDrops.processingError,
			uploadError: inventoryDrops.uploadError,
			retryCount: inventoryDrops.retryCount,
			processedAt: inventoryDrops.processedAt,
			reviewedAt: inventoryDrops.reviewedAt,
			finalizeTaskId: inventoryDrops.finalizeTaskId,
			createdAt: inventoryDrops.createdAt
		})
		.from(inventoryDrops)
		.leftJoin(users, eq(inventoryDrops.userId, users.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(inventoryDrops.createdAt))
		.limit(limit)
		.offset(offset);

	return json({ drops });
};

// POST /api/inventory-drops - Create new inventory drop (async - queues for background processing)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Only purchasers and above can create drops
	if (!['purchaser', 'manager', 'admin'].includes(locals.user.role)) {
		return json({ error: 'Only purchasers and above can create inventory drops' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { description, pickNotes, photos } = body;

		if (!description?.trim()) {
			return json({ error: 'Description is required' }, { status: 400 });
		}

		if (!photos || !Array.isArray(photos) || photos.length === 0) {
			return json({ error: 'At least one photo is required' }, { status: 400 });
		}

		if (photos.length > 10) {
			return json({ error: 'Maximum 10 photos allowed per drop' }, { status: 400 });
		}

		// Use the service to create the drop and queue processing
		const { createDrop } = await import('$lib/server/services/inventory-drops');
		const { drop, jobId } = await createDrop({
			userId: locals.user.id,
			description,
			pickNotes,
			photos
		});

		return json({
			drop,
			jobId,
			message: 'Drop created and queued for processing'
		}, { status: 201 });
	} catch (error) {
		console.error('Error creating inventory drop:', error);
		return json({ error: 'Failed to create inventory drop' }, { status: 500 });
	}
};
