// Booth summary — derives, per NRS vendor id, what TeamTime knows about a
// vendor's booth from the floorplan cell store (spec: booth size is always
// derived from cell count, never stored) plus pool membership. Feeds the
// vendor metadata TeamTime pushes to NRS (Booth Details / Booth Size and
// Location / Display in Teamtime Floorplan). TeamTime is the source of truth
// for floorplan data, so these strings are authoritative and NRS mirrors them.

import { and, eq, inArray } from 'drizzle-orm';
import { db, floorplanPlans, floorplanCellAttrs, floorplanPools } from '$lib/server/db';

export interface BoothPlanFootprint {
	planName: string;
	cells: number;
	/** [minX, minY, maxX, maxY] in 1 ft cells */
	bbox: [number, number, number, number];
	/** zone → cell count, descending */
	zones: { zone: string; cells: number }[];
	levels: string[];
}

export interface BoothSummary {
	nrsVendorId: string;
	/** Total painted cells across every plan (1 cell = 1 sq ft). */
	cells: number;
	plans: BoothPlanFootprint[];
	/** Shared/in-store pools this vendor belongs to. */
	pools: string[];
}

export interface BoothMetaValues {
	/** Booth Details (meta72). '' when the vendor isn't on the floorplan. */
	meta72: string;
	/** Booth Size and Location (meta73). '' when not on the floorplan. */
	meta73: string;
	/** Display in Teamtime Floorplan (meta74). */
	meta74: boolean;
}

const SUMMARY_KEYS = ['vendor_id', 'zone', 'level'];

/** Pure builder so the summary can be unit-tested without a database. */
export function buildBoothSummaries(
	plans: { id: string; name: string }[],
	rows: { planId: string; x: number; y: number; key: string; value: string }[],
	pools: { name: string; vendorIds: unknown }[]
): Map<string, BoothSummary> {
	const out = new Map<string, BoothSummary>();
	const ensure = (id: string): BoothSummary => {
		let s = out.get(id);
		if (!s) {
			s = { nrsVendorId: id, cells: 0, plans: [], pools: [] };
			out.set(id, s);
		}
		return s;
	};

	for (const plan of plans) {
		const planRows = rows.filter((r) => r.planId === plan.id);
		const zoneAt = new Map<string, string>();
		const levelAt = new Map<string, string>();
		for (const r of planRows) {
			if (r.key === 'zone') zoneAt.set(`${r.x},${r.y}`, r.value);
			else if (r.key === 'level') levelAt.set(`${r.x},${r.y}`, r.value);
		}

		const perVendor = new Map<string, { x: number; y: number }[]>();
		for (const r of planRows) {
			if (r.key !== 'vendor_id') continue;
			const list = perVendor.get(r.value) ?? [];
			list.push({ x: r.x, y: r.y });
			perVendor.set(r.value, list);
		}

		for (const [vendorId, cells] of perVendor) {
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			const zoneCounts = new Map<string, number>();
			const levels = new Set<string>();
			for (const c of cells) {
				if (c.x < minX) minX = c.x;
				if (c.y < minY) minY = c.y;
				if (c.x > maxX) maxX = c.x;
				if (c.y > maxY) maxY = c.y;
				const z = zoneAt.get(`${c.x},${c.y}`);
				if (z) zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
				const l = levelAt.get(`${c.x},${c.y}`);
				if (l) levels.add(l);
			}
			const s = ensure(vendorId);
			s.cells += cells.length;
			s.plans.push({
				planName: plan.name,
				cells: cells.length,
				bbox: [minX, minY, maxX, maxY],
				zones: [...zoneCounts.entries()]
					.map(([zone, n]) => ({ zone, cells: n }))
					.sort((a, b) => b.cells - a.cells || a.zone.localeCompare(b.zone)),
				levels: [...levels].sort()
			});
		}
	}

	for (const pool of pools) {
		const raw = pool.vendorIds;
		const ids = Array.isArray(raw) ? raw.map(String) : [];
		const name = pool.name ?? '';
		for (const id of ids) {
			const s = ensure(id);
			if (name && !s.pools.includes(name)) s.pools.push(name);
		}
	}
	for (const s of out.values()) s.pools.sort();
	return out;
}

/** Live summaries for every vendor painted on any plan or in any pool. */
export async function computeBoothSummaries(): Promise<Map<string, BoothSummary>> {
	const plans = await db.select({ id: floorplanPlans.id, name: floorplanPlans.name }).from(floorplanPlans);
	if (plans.length === 0) return new Map();
	const rows = await db
		.select({
			planId: floorplanCellAttrs.planId,
			x: floorplanCellAttrs.x,
			y: floorplanCellAttrs.y,
			key: floorplanCellAttrs.key,
			value: floorplanCellAttrs.value
		})
		.from(floorplanCellAttrs)
		.where(
			and(
				inArray(floorplanCellAttrs.planId, plans.map((p) => p.id)),
				inArray(floorplanCellAttrs.key, SUMMARY_KEYS)
			)
		);
	const pools = await db.select({ name: floorplanPools.name, vendorIds: floorplanPools.vendorIds }).from(floorplanPools);
	return buildBoothSummaries(plans, rows, pools);
}

/** NRS vendor ids currently painted at the given cells of a plan. */
export async function vendorIdsAtCells(planId: string, coords: { x: number; y: number }[]): Promise<string[]> {
	if (coords.length === 0) return [];
	const wanted = new Set(coords.map((c) => `${c.x},${c.y}`));
	const rows = await db
		.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y, value: floorplanCellAttrs.value })
		.from(floorplanCellAttrs)
		.where(and(eq(floorplanCellAttrs.planId, planId), eq(floorplanCellAttrs.key, 'vendor_id')));
	return [...new Set(rows.filter((r) => wanted.has(`${r.x},${r.y}`)).map((r) => r.value))];
}

function titleCase(s: string): string {
	return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

const MANAGED_NOTE = 'Managed by TeamTime floorplan - edit the floorplan in TeamTime, not here.';

/**
 * Render the NRS metadata values for one vendor. Pure. A vendor with no
 * cells and no pools gets blank strings + meta74=false so NRS reflects
 * "not on the floorplan" rather than stale text.
 */
export function formatBoothMeta(
	summary: BoothSummary | undefined,
	vendor: { boothNumber: string | null }
): BoothMetaValues {
	const onFloor = !!summary && (summary.cells > 0 || summary.pools.length > 0);
	if (!onFloor) return { meta72: '', meta73: '', meta74: false };
	const s = summary!;

	const zones = [...new Set(s.plans.flatMap((p) => p.zones.map((z) => titleCase(z.zone))))];
	const levels = [...new Set(s.plans.flatMap((p) => p.levels))];

	const details: string[] = [];
	if (vendor.boothNumber) details.push(`Booth #${vendor.boothNumber}`);
	details.push(s.cells > 0 ? `${s.cells} sq ft` : 'No booth cells (pool space only)');
	if (zones.length) details.push(`Zone: ${zones.join(', ')}`);
	if (s.pools.length) details.push(`Pools: ${s.pools.join(', ')}`);
	if (levels.length) details.push(`Level: ${levels.join(', ')}`);
	const meta72 = `${details.join(' | ')} | ${MANAGED_NOTE}`;

	const footprints = s.plans.map((p) => {
		const [minX, minY, maxX, maxY] = p.bbox;
		const w = maxX - minX + 1;
		const d = maxY - minY + 1;
		const zone = p.zones.length ? `, zone ${p.zones.map((z) => titleCase(z.zone)).join('/')}` : '';
		return `${p.cells} sq ft, ${w} ft x ${d} ft footprint, grid (${minX},${minY})-(${maxX},${maxY})${zone}, plan "${p.planName}"`;
	});
	if (s.pools.length) footprints.push(`Shared pool space: ${s.pools.join(', ')}`);
	const meta73 = footprints.join('; ');

	return { meta72, meta73, meta74: true };
}
