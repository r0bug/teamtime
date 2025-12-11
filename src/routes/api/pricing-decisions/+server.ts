import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, pricingDecisions, pricingDecisionPhotos, tasks, users } from '$lib/server/db';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:pricing-decisions');

// GET /api/pricing-decisions - List pricing decisions
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = url.searchParams.get('userId');
	const destination = url.searchParams.get('destination') as 'store' | 'ebay' | null;
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);

	try {
		// Build conditions array
		const conditions = [];

		// Non-managers can only see their own pricing decisions
		const isManager = locals.user.role === 'manager' || locals.user.role === 'admin';
		if (!isManager) {
			conditions.push(eq(pricingDecisions.userId, locals.user.id));
		} else if (userId) {
			conditions.push(eq(pricingDecisions.userId, userId));
		}

		if (destination) {
			conditions.push(eq(pricingDecisions.destination, destination));
		}

		if (startDate) {
			conditions.push(gte(pricingDecisions.pricedAt, new Date(startDate)));
		}

		if (endDate) {
			conditions.push(lte(pricingDecisions.pricedAt, new Date(endDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const decisions = await db
			.select({
				id: pricingDecisions.id,
				userId: pricingDecisions.userId,
				userName: users.name,
				itemDescription: pricingDecisions.itemDescription,
				price: pricingDecisions.price,
				priceJustification: pricingDecisions.priceJustification,
				destination: pricingDecisions.destination,
				ebayReason: pricingDecisions.ebayReason,
				ebayTaskId: pricingDecisions.ebayTaskId,
				locationId: pricingDecisions.locationId,
				lat: pricingDecisions.lat,
				lng: pricingDecisions.lng,
				address: pricingDecisions.address,
				pricedAt: pricingDecisions.pricedAt,
				createdAt: pricingDecisions.createdAt
			})
			.from(pricingDecisions)
			.leftJoin(users, eq(pricingDecisions.userId, users.id))
			.where(whereClause)
			.orderBy(desc(pricingDecisions.pricedAt))
			.limit(limit)
			.offset(offset);

		// Get photos for each decision
		const decisionsWithPhotos = await Promise.all(
			decisions.map(async (decision) => {
				const photos = await db
					.select()
					.from(pricingDecisionPhotos)
					.where(eq(pricingDecisionPhotos.pricingDecisionId, decision.id));
				return { ...decision, photos };
			})
		);

		// Get total count for pagination
		const countResult = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(pricingDecisions)
			.where(whereClause);

		return json({
			decisions: decisionsWithPhotos,
			total: countResult[0]?.count || 0,
			limit,
			offset
		});
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error fetching pricing decisions');
		return json({ error: 'Failed to fetch pricing decisions' }, { status: 500 });
	}
};

// POST /api/pricing-decisions - Create a new pricing decision
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			itemDescription,
			price,
			priceJustification,
			destination,
			ebayReason,
			locationId,
			lat,
			lng,
			address,
			photos // Array of { filePath, originalName, mimeType, sizeBytes, lat?, lng?, capturedAt? }
		} = body;

		// Validation
		if (!itemDescription || !itemDescription.trim()) {
			return json({ error: 'Item description is required' }, { status: 400 });
		}

		if (!price || price <= 0) {
			return json({ error: 'Price must be a positive number' }, { status: 400 });
		}

		if (!priceJustification || priceJustification.trim().length < 10) {
			return json({ error: 'Price justification must be at least 10 characters' }, { status: 400 });
		}

		if (!destination || !['store', 'ebay'].includes(destination)) {
			return json({ error: 'Destination must be either "store" or "ebay"' }, { status: 400 });
		}

		if (destination === 'ebay' && (!ebayReason || !ebayReason.trim())) {
			return json({ error: 'eBay reason is required when destination is "ebay"' }, { status: 400 });
		}

		if (!photos || !Array.isArray(photos) || photos.length === 0) {
			return json({ error: 'At least one photo is required' }, { status: 400 });
		}

		// Create the pricing decision
		const [newDecision] = await db
			.insert(pricingDecisions)
			.values({
				userId: locals.user.id,
				itemDescription: itemDescription.trim(),
				price: price.toString(),
				priceJustification: priceJustification.trim(),
				destination,
				ebayReason: destination === 'ebay' ? ebayReason.trim() : null,
				locationId: locationId || null,
				lat: lat?.toString() || null,
				lng: lng?.toString() || null,
				address: address || null
			})
			.returning();

		// Insert photos
		if (photos.length > 0) {
			interface PhotoData {
				filePath: string;
				originalName: string;
				mimeType: string;
				sizeBytes: number;
				lat?: number;
				lng?: number;
				capturedAt?: string;
			}

			await db.insert(pricingDecisionPhotos).values(
				photos.map((photo: PhotoData) => ({
					pricingDecisionId: newDecision.id,
					filePath: photo.filePath,
					originalName: photo.originalName,
					mimeType: photo.mimeType,
					sizeBytes: photo.sizeBytes,
					lat: photo.lat?.toString() || null,
					lng: photo.lng?.toString() || null,
					capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : null
				}))
			);
		}

		// If destination is eBay, create an eBay listing task
		let ebayTaskId: string | null = null;
		if (destination === 'ebay') {
			const [newTask] = await db
				.insert(tasks)
				.values({
					title: `List on eBay: ${itemDescription.trim().substring(0, 50)}${itemDescription.length > 50 ? '...' : ''}`,
					description: `**Item:** ${itemDescription}\n\n**Price:** $${parseFloat(price).toFixed(2)}\n\n**Price Justification:** ${priceJustification}\n\n**Reason for eBay:** ${ebayReason}\n\n*This task was auto-created from a pricing decision.*`,
					priority: 'medium',
					status: 'not_started',
					source: 'ebay_listing',
					// Leave assignedTo null - any eBay-capable user can claim it
					createdBy: locals.user.id
				})
				.returning();

			ebayTaskId = newTask.id;

			// Update the pricing decision with the task ID
			await db
				.update(pricingDecisions)
				.set({ ebayTaskId: newTask.id })
				.where(eq(pricingDecisions.id, newDecision.id));
		}

		// Fetch the complete decision with photos
		const photosResult = await db
			.select()
			.from(pricingDecisionPhotos)
			.where(eq(pricingDecisionPhotos.pricingDecisionId, newDecision.id));

		return json({
			success: true,
			decision: {
				...newDecision,
				ebayTaskId,
				photos: photosResult
			}
		}, { status: 201 });
	} catch (error) {
		log.error({ error, userId: locals.user.id, itemDescription }, 'Error creating pricing decision');
		return json({ error: 'Failed to create pricing decision' }, { status: 500 });
	}
};
