// Shared loader for the read-only "where is this vendor on the floor" views
// (admin: /admin/vendors/[id]/floorplan, portal: /vendor/floorplan). Same
// plan + cells as /floorplan, but the result only marks ONE vendor: their
// booth (cells whose vendor_id is the vendor's NRS id) plus the shared pools
// they belong to. Booth size is derived from the cell count, never stored.

import { eq } from 'drizzle-orm';
import { db, floorplanPools, type FloorplanPool, type Vendor } from '$lib/server/db';
import { listPlans, getAttrDefs, queryCells, type Cell } from '$lib/server/floorplan/core';
import type { FloorplanAttrDef } from '$lib/server/db/schema';

export interface VendorFloorPlanInfo {
	id: string;
	name: string;
	gridW: number;
	gridH: number;
}

export interface VendorFloorPool {
	id: string;
	name: string;
	color: string;
	cellKeys: string[];
}

export interface VendorFloorView {
	plans: VendorFloorPlanInfo[];
	plan: VendorFloorPlanInfo | null;
	/** 'missing' when ?plan= names a plan that doesn't exist */
	planStatus: 'ok' | 'none' | 'missing';
	cells: Cell[];
	attrDefs: FloorplanAttrDef[];
	boothKeys: string[];
	pools: VendorFloorPool[];
}

/**
 * @param attrFilter  Strips each cell's attrs down to what the viewer may
 *   see on the client. The booth/pool computation runs on the UNFILTERED
 *   attrs, so a viewer who can't see vendor_id still gets their own booth
 *   marked — without the other vendors' ids leaving the server.
 */
export async function loadVendorFloorView(
	vendor: Pick<Vendor, 'nrsVendorId'>,
	requestedPlanId: string | null,
	attrFilter: (attrs: Record<string, string>, defs: FloorplanAttrDef[]) => Record<string, string>
): Promise<VendorFloorView> {
	const plans = await listPlans();
	const planId = requestedPlanId ?? plans[0]?.id;
	const plan = plans.find((p) => p.id === planId);
	const planInfos = plans.map((p) => ({ id: p.id, name: p.name, gridW: p.gridW, gridH: p.gridH }));

	if (!plan) {
		return {
			plans: planInfos,
			plan: null,
			planStatus: planId ? 'missing' : 'none',
			cells: [],
			attrDefs: [],
			boothKeys: [],
			pools: []
		};
	}

	const allDefs = await getAttrDefs(plan.id);
	const raw = await queryCells(plan.id, []);
	const nrsId = vendor.nrsVendorId !== null && vendor.nrsVendorId !== undefined ? String(vendor.nrsVendorId) : null;

	const boothKeys = nrsId ? raw.filter((c) => c.attrs.vendor_id === nrsId).map((c) => `${c.x},${c.y}`) : [];

	const poolRows = await db.select().from(floorplanPools).where(eq(floorplanPools.planId, plan.id));
	const pools = poolRows
		.filter((p) => nrsId !== null && normalizeIds(p).includes(nrsId))
		.map((p) => ({
			id: p.id,
			name: p.name,
			color: p.color,
			cellKeys: raw.filter((c) => c.attrs.pool === p.name).map((c) => `${c.x},${c.y}`)
		}));

	const cells = raw
		.map((c) => ({ ...c, attrs: attrFilter(c.attrs, allDefs) }))
		.filter((c) => Object.keys(c.attrs).length > 0);
	const visibleKeys = new Set(cells.flatMap((c) => Object.keys(c.attrs)));
	const attrDefs = allDefs.filter((d) => visibleKeys.has(d.key));

	return {
		plans: planInfos,
		plan: { id: plan.id, name: plan.name, gridW: plan.gridW, gridH: plan.gridH },
		planStatus: 'ok',
		cells,
		attrDefs,
		boothKeys,
		pools
	};
}

/** Vendor-portal attr whitelist: just enough to draw the building outline. */
export const PORTAL_VISIBLE_KEYS = new Set(['kind', 'door']);

export function portalAttrFilter(attrs: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of PORTAL_VISIBLE_KEYS) if (attrs[key] !== undefined) out[key] = attrs[key];
	return out;
}

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
