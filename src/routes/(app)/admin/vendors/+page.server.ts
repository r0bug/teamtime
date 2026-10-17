import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db, vendors as vendorsTable } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import {
	listVendors,
	startNrsSyncInBackground,
	getNrsSyncStatus,
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
	// NRS pass-through children (hidden rows) shown as a chip on their parent.
	const childRows = await db
		.select({ parent: vendorsTable.parentNrsVendorId, code: vendorsTable.inventoryCodePrefix, name: vendorsTable.displayName })
		.from(vendorsTable)
		.where(sql`${vendorsTable.parentNrsVendorId} IS NOT NULL`);
	const childrenByParent = new Map<number, string[]>();
	for (const c of childRows) if (c.parent) childrenByParent.set(c.parent, [...(childrenByParent.get(c.parent) ?? []), c.code ?? c.name]);
	const vendorsWithChildren = vendors.map((v) => ({ ...v, passThroughChildren: v.nrsVendorId ? childrenByParent.get(v.nrsVendorId) ?? [] : [] }));

	const [{ count: needsOnboardingCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.onboardingComplete, false));

	const [{ count: nrsInactiveCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.nrsInactive, true));

	return {
		syncStatus: await getNrsSyncStatus(),
		vendors: vendorsWithChildren,
		filters: { status, search, includeNrsInactive },
		nrsInactiveCount,
		needsOnboardingCount,
		// Staff can see this list by design, but onboarding is manager-only — surface
		// that so the page doesn't offer a button that 403s.
		canOnboard: isManager(locals.user)
	};
};

export const actions: Actions = {
	syncNrs: async ({ locals }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		// The sync takes minutes (past nginx's 60 s proxy timeout), so it runs in
		// the background; the page polls /api/admin/vendors/sync-status.
		const started = startNrsSyncInBackground(locals.user.name ?? locals.user.email ?? null);
		if (started) {
			// Refresh floorplan delta flags whenever the vendor mirror refreshes.
			runFloorplanSync().catch(() => {});
		}
		return { syncStarted: started };
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
