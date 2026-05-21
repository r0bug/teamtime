import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { and, eq, gt, desc } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';

/**
 * GET /api/vendor/items?modified_since=<iso8601>&limit=<n>
 * Returns the calling vendor's items as recorded in pendingInventoryChanges.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) return json({ error: 'Vendor portal access not enabled' }, { status: 403 });

	const sinceRaw = url.searchParams.get('modified_since');
	let since: Date | null = null;
	if (sinceRaw) {
		since = new Date(sinceRaw);
		if (isNaN(since.getTime())) {
			return json({ error: 'modified_since must be ISO 8601' }, { status: 400 });
		}
	}

	const limitRaw = url.searchParams.get('limit');
	const limitParsed = limitRaw ? parseInt(limitRaw, 10) || 200 : 200;
	const limit = Math.max(1, Math.min(1000, limitParsed));

	const conditions = since
		? and(eq(pendingInventoryChanges.vendorId, vendor.id), gt(pendingInventoryChanges.submittedAt, since))
		: eq(pendingInventoryChanges.vendorId, vendor.id);

	const rows = await db
		.select()
		.from(pendingInventoryChanges)
		.where(conditions)
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(limit);

	return json({
		serverTime: new Date().toISOString(),
		items: rows.map((r) => ({
			partNumber: r.partNumber,
			changeType: r.changeType,
			payload: r.payload,
			submittedAt: r.submittedAt
		}))
	});
};
