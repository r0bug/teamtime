import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, customerHolds, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { urgencyAnchor, HOLD_REASONS } from '$lib/server/services/holds-service';
import { isVendorPortalUser } from '$lib/server/auth/vendor-portal';
import { isUploadPath } from '$lib/uploads';

const log = createLogger('api:holds');

// GET /api/holds?status=active|cleared — list holds (staff only; holds carry
// customer PII and vendor-portal users have no business in the holds area)
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const status = url.searchParams.get('status') === 'cleared' ? 'cleared' : 'active';

	try {
		const rows = await db
			.select({
				id: customerHolds.id,
				reason: customerHolds.reason,
				missingPrice: customerHolds.missingPrice,
				customerName: customerHolds.customerName,
				customerPhone: customerHolds.customerPhone,
				itemDescription: customerHolds.itemDescription,
				pickupDate: customerHolds.pickupDate,
				notes: customerHolds.notes,
				photoPath: customerHolds.photoPath,
				status: customerHolds.status,
				clearedReason: customerHolds.clearedReason,
				clearedAt: customerHolds.clearedAt,
				createdAt: customerHolds.createdAt,
				createdByUserId: customerHolds.createdByUserId,
				createdByName: users.name
			})
			.from(customerHolds)
			.leftJoin(users, eq(customerHolds.createdByUserId, users.id))
			.where(eq(customerHolds.status, status))
			.orderBy(status === 'cleared' ? desc(customerHolds.clearedAt) : desc(customerHolds.createdAt))
			.limit(200);

		const holds = rows.map((h) => ({
			...h,
			urgencyAnchor: urgencyAnchor(h).toISOString()
		}));

		// Active queue: most-overdue first (oldest anchor first).
		if (status === 'active') {
			holds.sort((a, b) => new Date(a.urgencyAnchor).getTime() - new Date(b.urgencyAnchor).getTime());
		}

		return json({ holds });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error fetching holds');
		return json({ error: 'Failed to fetch holds' }, { status: 500 });
	}
};

// POST /api/holds — create a hold (staff only)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const {
			reason,
			missingPrice = false,
			customerName,
			customerPhone,
			itemDescription,
			pickupDate,
			notes,
			photo // { filePath, originalName, mimeType, sizeBytes }
		} = body;

		if (!reason || !HOLD_REASONS.includes(reason)) {
			return json({ error: 'A valid hold reason is required' }, { status: 400 });
		}

		if (!photo || !photo.filePath) {
			return json({ error: 'A photo of the item is required' }, { status: 400 });
		}
		// Photo must be a local upload path (it is later rendered in the UI).
		if (!isUploadPath(photo.filePath)) {
			return json({ error: 'Invalid photo path' }, { status: 400 });
		}

		// Customer details are required unless this is a "missing price" hold.
		if (!missingPrice) {
			if (!customerName || !customerName.trim()) {
				return json({ error: 'Customer name is required' }, { status: 400 });
			}
			if (!customerPhone || !customerPhone.trim()) {
				return json({ error: 'Customer phone is required' }, { status: 400 });
			}
		}

		// Pickup date is required when the reason is a customer pickup, and must
		// be a real YYYY-MM-DD date — anything else would 500 at the insert.
		if (reason === 'customer_pickup') {
			if (!pickupDate) {
				return json({ error: 'A pickup date is required for customer pickup holds' }, { status: 400 });
			}
			const valid =
				typeof pickupDate === 'string' &&
				/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) &&
				new Date(`${pickupDate}T00:00:00Z`).toISOString().slice(0, 10) === pickupDate;
			if (!valid) {
				return json({ error: 'Pickup date must be a valid date (YYYY-MM-DD)' }, { status: 400 });
			}
		}

		const [hold] = await db
			.insert(customerHolds)
			.values({
				createdByUserId: locals.user.id,
				reason,
				missingPrice: !!missingPrice,
				customerName: missingPrice ? customerName?.trim() || null : customerName.trim(),
				customerPhone: missingPrice ? customerPhone?.trim() || null : customerPhone.trim(),
				itemDescription: itemDescription?.trim() || null,
				pickupDate: reason === 'customer_pickup' ? pickupDate : null,
				notes: notes?.trim() || null,
				photoPath: photo.filePath,
				photoOriginalName: photo.originalName || 'photo',
				photoMimeType: photo.mimeType || 'image/jpeg',
				photoSizeBytes: photo.sizeBytes || 0
			})
			.returning();

		return json({ success: true, hold }, { status: 201 });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error creating hold');
		return json({ error: 'Failed to create hold' }, { status: 500 });
	}
};
