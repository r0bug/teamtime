import type { PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import {
	getVendorPersonalStats,
	type VendorPersonalStats
} from '$lib/server/services/vendor-stats-service';

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();

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

	return { changeCounts: byStatus, personalStats };
};
