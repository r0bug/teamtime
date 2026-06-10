import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, customerHolds, users } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { urgencyAnchor, HOLD_CLEARED_REASONS } from '$lib/server/services/holds-service';
import { isVendorPortalUser } from '$lib/server/auth/vendor-portal';
import { isUuid } from '$lib/utils';

const log = createLogger('api:holds:id');

// GET /api/holds/[id] — single hold (staff only)
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	// Non-UUID ids would throw at the query and surface as a 500.
	if (!isUuid(params.id)) {
		return json({ error: 'Hold not found' }, { status: 404 });
	}

	try {
		const [hold] = await db
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
				createdByName: users.name
			})
			.from(customerHolds)
			.leftJoin(users, eq(customerHolds.createdByUserId, users.id))
			.where(eq(customerHolds.id, params.id))
			.limit(1);

		if (!hold) {
			return json({ error: 'Hold not found' }, { status: 404 });
		}

		return json({ hold: { ...hold, urgencyAnchor: urgencyAnchor(hold).toISOString() } });
	} catch (error) {
		log.error({ error, holdId: params.id }, 'Error fetching hold');
		return json({ error: 'Failed to fetch hold' }, { status: 500 });
	}
};

// PATCH /api/holds/[id] — clear a hold (sold / returned / price received / cancelled)
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	if (!isUuid(params.id)) {
		return json({ error: 'Hold not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { action, clearedReason } = body;

		if (action !== 'clear') {
			return json({ error: 'Unsupported action' }, { status: 400 });
		}

		if (!clearedReason || !HOLD_CLEARED_REASONS.includes(clearedReason)) {
			return json({ error: 'A valid clear reason is required' }, { status: 400 });
		}

		// Conditional update: only an active hold can be cleared, so a concurrent
		// clear can't silently overwrite who cleared it and why.
		const [hold] = await db
			.update(customerHolds)
			.set({
				status: 'cleared',
				clearedReason,
				clearedByUserId: locals.user.id,
				clearedAt: new Date(),
				updatedAt: new Date()
			})
			.where(and(eq(customerHolds.id, params.id), eq(customerHolds.status, 'active')))
			.returning();

		if (!hold) {
			const [existing] = await db
				.select({ status: customerHolds.status })
				.from(customerHolds)
				.where(eq(customerHolds.id, params.id))
				.limit(1);
			if (!existing) {
				return json({ error: 'Hold not found' }, { status: 404 });
			}
			return json({ error: 'Hold is already cleared' }, { status: 409 });
		}

		return json({ success: true, hold });
	} catch (error) {
		log.error({ error, holdId: params.id, userId: locals.user.id }, 'Error clearing hold');
		return json({ error: 'Failed to clear hold' }, { status: 500 });
	}
};
