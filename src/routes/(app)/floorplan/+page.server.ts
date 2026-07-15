import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, ne, not, isNull } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import { listPlans, getAttrDefs, queryCells } from '$lib/server/floorplan/core';
import { canView, canBuild, viewerRank, visibleDefs, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!canView(locals.user)) throw redirect(302, '/dashboard');

	const plans = await listPlans();
	const planId = url.searchParams.get('plan') ?? plans[0]?.id;
	const plan = plans.find((p) => p.id === planId);
	if (planId && !plan) throw error(404, 'Plan not found');

	if (!plan) {
		return { plans: [], plan: null, cells: [], attrDefs: [], vendorOptions: [], canEdit: false, canBuild: false };
	}

	const rank = viewerRank(locals.user);
	const allDefs = await getAttrDefs(plan.id);
	const attrDefs = visibleDefs(allDefs, rank);
	const byKey = defsByKey(allDefs);

	// Full cell set in one load (a plan is ~7k cells / ~15k attrs — fine to
	// serialize, and it avoids a client fetch waterfall before first paint).
	const cells = (await queryCells(plan.id, []))
		.map((c) => ({ ...c, attrs: filterAttrsByRank(c.attrs, byKey, rank) }))
		.filter((c) => Object.keys(c.attrs).length > 0);

	// Vendor picker options for Edit mode: NRS-linked and not gone. NOTE:
	// vendors.status stays at its 'inactive' default for sync-created rows —
	// real activeness lives in nrsInactive, so don't require status='active'.
	const vendorOptions = await db
		.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName })
		.from(vendors)
		.where(and(ne(vendors.status, 'terminated'), eq(vendors.nrsInactive, false), not(isNull(vendors.nrsVendorId))))
		.orderBy(asc(vendors.displayName));

	return {
		plans: plans.map((p) => ({ id: p.id, name: p.name, gridW: p.gridW, gridH: p.gridH })),
		plan: { id: plan.id, name: plan.name, gridW: plan.gridW, gridH: plan.gridH },
		cells,
		attrDefs,
		vendorOptions: vendorOptions as { nrsVendorId: number; displayName: string }[],
		canEdit: true, // any staff-side user (vendor-portal users never reach here)
		canBuild: canBuild(locals.user)
	};
};
