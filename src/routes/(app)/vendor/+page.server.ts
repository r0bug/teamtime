import type { PageServerLoad } from './$types';
import { and, eq, or, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, pendingInventoryChanges, salesTransactions, staffNotes, users } from '$lib/server/db';
import {
	getVendorPersonalStats,
	type VendorPersonalStats
} from '$lib/server/services/vendor-stats-service';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vendor } = await parent();

	// Notes from the team for this vendor (personally or to all vendors).
	const noteRecipient = alias(users, 'note_recipient');
	const notesForYou = await db
		.select({
			id: staffNotes.id,
			body: staffNotes.body,
			photoPath: staffNotes.photoPath,
			createdAt: staffNotes.createdAt,
			createdByName: users.name,
			recipientGroup: staffNotes.recipientGroup,
			recipientUserId: staffNotes.recipientUserId,
			recipientName: noteRecipient.name
		})
		.from(staffNotes)
		.leftJoin(users, eq(staffNotes.createdByUserId, users.id))
		.leftJoin(noteRecipient, eq(staffNotes.recipientUserId, noteRecipient.id))
		.where(
			and(
				eq(staffNotes.status, 'active'),
				or(eq(staffNotes.recipientUserId, locals.user!.id), eq(staffNotes.recipientGroup, 'all_vendors'))
			)
		)
		.orderBy(desc(staffNotes.createdAt))
		.limit(4);

	const counts = await db
		.select({
			status: pendingInventoryChanges.status,
			count: sql<number>`count(*)::int`
		})
		.from(pendingInventoryChanges)
		.where(eq(pendingInventoryChanges.vendorId, vendor.id))
		.groupBy(pendingInventoryChanges.status);

	const byStatus = { pending: 0, applied: 0, rejected: 0, cancelled: 0 };
	for (const c of counts) byStatus[c.status] = c.count;

	let personalStats: VendorPersonalStats | null = null;
	if (vendor.nrsVendorId) {
		try {
			personalStats = await getVendorPersonalStats(vendor.nrsVendorId);
		} catch {
			// Stats are best-effort — never break the dashboard if a stats query fails.
			personalStats = null;
		}
	}

	// Base-item check: every vendor needs a catch-all item whose name matches
	// their inventory prefix (e.g. SR for Storlie's Relics) so staff can ring up
	// generic-tag merchandise without looking up specific SKUs. We probe TT's
	// local mirrors (salesTransactions = items NRS has actually rung up,
	// pendingInventoryChanges = items the vendor has submitted via the portal).
	// This will miss items added to NRS by staff that have never sold and have
	// no portal record — a future enhancement is to query NRS directly.
	const baseItemCheck = await checkBaseItem(
		vendor.id,
		vendor.nrsVendorId,
		vendor.inventoryCodePrefix
	);

	return { changeCounts: byStatus, personalStats, baseItemCheck, notesForYou };
};

async function checkBaseItem(
	vendorId: string,
	nrsVendorId: number | null,
	prefix: string | null
): Promise<{ hasBaseItem: boolean; checkable: boolean; expectedName: string | null }> {
	if (!prefix) {
		// No prefix configured → can't check. Treat as "not checkable" so the UI
		// can prompt staff to set a prefix rather than warning the vendor about it.
		return { hasBaseItem: false, checkable: false, expectedName: null };
	}

	// Sold items in NRS (via TT's mirror). Case-insensitive match on partName.
	if (nrsVendorId) {
		const sold = await db
			.select({ partId: salesTransactions.partId })
			.from(salesTransactions)
			.where(
				and(
					eq(salesTransactions.vendorId, nrsVendorId),
					sql`LOWER(${salesTransactions.partName}) = LOWER(${prefix})`
				)
			)
			.limit(1);
		if (sold.length > 0) {
			return { hasBaseItem: true, checkable: true, expectedName: prefix };
		}
	}

	// Items submitted via portal (any non-cancelled/rejected status).
	const submitted = await db
		.select({ id: pendingInventoryChanges.id })
		.from(pendingInventoryChanges)
		.where(
			and(
				eq(pendingInventoryChanges.vendorId, vendorId),
				sql`LOWER(${pendingInventoryChanges.payload}->>'partName') = LOWER(${prefix})`,
				sql`${pendingInventoryChanges.status} IN ('pending', 'applied')`
			)
		)
		.limit(1);

	return { hasBaseItem: submitted.length > 0, checkable: true, expectedName: prefix };
}
