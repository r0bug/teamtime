import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db, vendors as vendorsTable } from '$lib/server/db';
import {
	listVendors,
	syncFromNrs,
	removeUnusedVendorStubs
} from '$lib/server/services/vendor-service';
import { runFloorplanSync } from '$lib/server/floorplan/sync';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/dashboard');

	const status = url.searchParams.get('status') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const includeNrsInactive = url.searchParams.get('showInactive') === '1';

	const filters: Parameters<typeof listVendors>[0] = { includeNrsInactive };
	if (status === 'active' || status === 'inactive' || status === 'terminated') filters.status = status;
	if (search) filters.search = search;

	const vendors = await listVendors(filters);

	const [{ count: needsOnboardingCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.onboardingComplete, false));

	const [{ count: nrsInactiveCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.nrsInactive, true));

	return {
		vendors,
		filters: { status, search, includeNrsInactive },
		nrsInactiveCount,
		needsOnboardingCount
	};
};

export const actions: Actions = {
	syncNrs: async ({ locals }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		try {
			const result = await syncFromNrs();
			// Refresh floorplan delta flags whenever the vendor mirror refreshes.
			// Fire-and-forget: floorplan issues must never break vendor sync.
			runFloorplanSync().catch(() => {});
			return { syncResult: result };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'NRS sync failed' });
		}
	},

	removeStubs: async ({ locals }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		try {
			const result = await removeUnusedVendorStubs();
			return { stubsResult: result };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Cleanup failed' });
		}
	}
};
