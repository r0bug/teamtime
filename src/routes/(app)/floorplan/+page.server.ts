import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, ne, not, isNull } from 'drizzle-orm';
import { db, vendors, floorplanPools, type FloorplanPool } from '$lib/server/db';
import { listPlans, getAttrDefs, queryCells } from '$lib/server/floorplan/core';
import { canView, canBuild, viewerRank, visibleDefs, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';
import type { VendorOption } from '$lib/floorplan/vendor-filter';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!canView(locals.user)) throw redirect(302, '/dashboard');

	const plans = await listPlans();
	const planId = url.searchParams.get('plan') ?? plans[0]?.id;
	const plan = plans.find((p) => p.id === planId);
	if (planId && !plan) throw error(404, 'Plan not found');

	if (!plan) {
		return { plans: [], plan: null, cells: [], attrDefs: [], vendorOptions: [], pools: [], canEdit: false, canBuild: false };
	}

	const rank = viewerRank(locals.user);
	const allDefs = await getAttrDefs(plan.id);
	const attrDefs = visibleDefs(allDefs, rank);
	const byKey = defsByKey(allDefs);

	// Full cell set in one load (a plan is ~7k cells / ~15k attrs — fine to
	// serialize, and it avoids a client fetch waterfall before first paint).
	const rawCells = await queryCells(plan.id, []);
	const cells = rawCells
		.map((c) => ({ ...c, attrs: filterAttrsByRank(c.attrs, byKey, rank) }))
		.filter((c) => Object.keys(c.attrs).length > 0);

	const poolRows = await db.select().from(floorplanPools).where(eq(floorplanPools.planId, plan.id));

	// Vendor picker options for Edit mode: NRS-linked and not gone. NOTE:
	// vendors.status stays at its 'inactive' default for sync-created rows —
	// real activeness lives in nrsInactive, so don't require status='active'.
	// The client narrows this to booth vendors by default (vendor-filter.ts):
	// rent payers / 87-13 splits, plus anyone already painted or pooled.
	const placedIds = new Set<string>();
	for (const c of rawCells) if (c.attrs.vendor_id) placedIds.add(c.attrs.vendor_id);
	for (const p of poolRows) for (const id of normalizeIds(p)) placedIds.add(id);

	const vendorRows = await db
		.select({
			nrsVendorId: vendors.nrsVendorId,
			displayName: vendors.displayName,
			vendorPaymentPercent: vendors.vendorPaymentPercent,
			monthlyRentCents: vendors.monthlyRentCents
		})
		.from(vendors)
		.where(and(ne(vendors.status, 'terminated'), eq(vendors.nrsInactive, false), not(isNull(vendors.nrsVendorId))))
		.orderBy(asc(vendors.displayName));
	const vendorOptions: VendorOption[] = vendorRows.map((v) => ({
		nrsVendorId: v.nrsVendorId!,
		displayName: v.displayName,
		vendorPaymentPercent: v.vendorPaymentPercent !== null ? Number(v.vendorPaymentPercent) : null,
		monthlyRentCents: v.monthlyRentCents,
		placed: placedIds.has(String(v.nrsVendorId))
	}));

	return {
		plans: plans.map((p) => ({ id: p.id, name: p.name, gridW: p.gridW, gridH: p.gridH })),
		plan: { id: plan.id, name: plan.name, gridW: plan.gridW, gridH: plan.gridH },
		cells,
		attrDefs,
		vendorOptions,
		pools: poolRows.map((p) => ({ id: p.id, name: p.name, color: p.color, vendorIds: normalizeIds(p) })),
		canEdit: true, // any staff-side user (vendor-portal users never reach here)
		canBuild: canBuild(locals.user)
	};
};

// drizzle 0.29 + postgres-js may return jsonb as a JSON string.
function normalizeIds(pool: FloorplanPool): string[] {
	const raw = pool.vendorIds as unknown;
	if (Array.isArray(raw)) return raw.map(String);
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			return [];
		}
	}
	return [];
}
