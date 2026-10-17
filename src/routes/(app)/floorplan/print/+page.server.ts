import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, vendors, floorplanPools } from '$lib/server/db';
import { listPlans, getAttrDefs, queryCells } from '$lib/server/floorplan/core';
import { canView, viewerRank, visibleDefs, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';
import { loadPayoutGroups, rollupNrsId } from '$lib/server/services/payout-group-service';

/**
 * Printable floorplan worksheet: the grid, outlines and shading staff need to
 * walk the floor and mark what changed. Same cell data and visibility rules as
 * the editor; vendor labels are codes (NRS pass-through children print as
 * their parent, like everywhere else).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!canView(locals.user)) throw redirect(302, '/dashboard');

	const plans = await listPlans();
	const planId = url.searchParams.get('plan') ?? plans[0]?.id;
	const plan = plans.find((p) => p.id === planId);
	if (planId && !plan) throw error(404, 'Plan not found');
	if (!plan) {
		return {
			plans: [] as { id: string; name: string }[],
			plan: null,
			cells: [] as { x: number; y: number; attrs: Record<string, string> }[],
			attrDefs: [] as Awaited<ReturnType<typeof getAttrDefs>>,
			pools: [] as { name: string; color: string }[],
			vendorsById: {} as Record<string, { code: string | null; name: string }>,
			zones: [] as string[],
			vendorCodes: {} as Record<string, { nrsVendorId: number; name: string }>,
			canEdit: false,
			printedBy: ''
		};
	}

	const rank = viewerRank(locals.user);
	const allDefs = await getAttrDefs(plan.id);
	const attrDefs = visibleDefs(allDefs, rank);
	const byKey = defsByKey(allDefs);
	const maps = await loadPayoutGroups();

	const rawCells = await queryCells(plan.id, []);
	const cells = rawCells
		.map((c) => {
			const attrs = filterAttrsByRank(c.attrs, byKey, rank);
			if (attrs.vendor_id && /^\d+$/.test(attrs.vendor_id)) attrs.vendor_id = String(rollupNrsId(maps, Number(attrs.vendor_id)));
			return { x: c.x, y: c.y, attrs };
		})
		.filter((c) => Object.keys(c.attrs).length > 0);

	const ids = [...new Set(cells.map((c) => c.attrs.vendor_id).filter((v): v is string => !!v && /^\d+$/.test(v)))].map(Number);
	const vendorRows = ids.length
		? await db
				.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName, code: vendors.inventoryCodePrefix })
				.from(vendors)
				.where(sql`${vendors.nrsVendorId} IN ${ids}`)
		: [];
	const vendorsById: Record<string, { code: string | null; name: string }> = {};
	for (const v of vendorRows) vendorsById[String(v.nrsVendorId)] = { code: v.code, name: v.displayName };

	const poolRows = await db.select({ name: floorplanPools.name, color: floorplanPools.color }).from(floorplanPools).where(eq(floorplanPools.planId, plan.id));
	// Every placeable vendor code → NRS id, for the "changes by text" box
	// (parents only: pass-through children are painted as their parent).
	const codeRows = await db
		.select({ code: vendors.inventoryCodePrefix, nrsVendorId: vendors.nrsVendorId, name: vendors.displayName })
		.from(vendors)
		.where(and(ne(vendors.status, 'terminated'), eq(vendors.nrsInactive, false), sql`${vendors.nrsVendorId} IS NOT NULL`, isNull(vendors.parentNrsVendorId)));
	const vendorCodes: Record<string, { nrsVendorId: number; name: string }> = {};
	for (const r of codeRows) if (r.code) vendorCodes[r.code.toUpperCase()] = { nrsVendorId: r.nrsVendorId!, name: r.name };
	const zones = [...new Set(cells.map((c) => c.attrs.zone).filter((z): z is string => !!z))].sort();

	return {
		plans: plans.map((p) => ({ id: p.id, name: p.name })),
		plan: { id: plan.id, name: plan.name, gridW: plan.gridW, gridH: plan.gridH },
		cells,
		attrDefs,
		pools: poolRows,
		vendorsById,
		zones,
		vendorCodes,
		canEdit: true,
		printedBy: locals.user.name ?? ''
	};
};
