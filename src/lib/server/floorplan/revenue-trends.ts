// Revenue per square foot over time — the "Revenue / sq ft" tab on /sales.
//
//   booth store revenue (month) = store's retained share of the occupants'
//                                 sales that month + monthly booth rent
//   per sq ft                   = store revenue / booth cells
//
// A booth is a vendor with painted cells, or a POOL (shared space): its
// occupants' sales are summed and its cells are any member's vendor_id cells
// plus pool-painted cells (same rule as the hover popover in revenue.ts).
//
// Sales come from sales_snapshots (daily NRS aggregates, latest capture per
// day — same source as the vendor leaderboard). Rent and square footage are
// the CURRENT values applied to every month: TeamTime has no rent history
// before the NRS-metadata log started (2026-10) and layout snapshots are
// saves, not a monthly series. The UI says so.

import { and, gte, lte, sql } from 'drizzle-orm';
import { db, vendors, salesSnapshots, floorplanPlans, floorplanCellAttrs, floorplanPools, type VendorSalesData } from '$lib/server/db';
import { getPacificDateParts } from '$lib/server/utils/timezone';

export interface BoothDef {
	/** 'v:17009' or 'p:<pool name>' */
	key: string;
	/** Vendor codes joined with ' + ' (falls back to NRS ids). */
	label: string;
	names: string[];
	vendorIds: number[];
	shared: boolean;
	sqft: number;
	rent: number;
}

export interface BoothMonth {
	month: string; // YYYY-MM
	retained: number;
	rent: number;
	storeRevenue: number;
	perSqft: number | null;
}

export interface BoothTrendRow extends BoothDef {
	months: BoothMonth[];
	/** per sq ft in the most recent full month */
	lastPerSqft: number | null;
	/** mean per sq ft across months in the window */
	avgPerSqft: number | null;
	/** % change: mean of the latest 3 months vs the 3 before (null when not enough data) */
	trendPct: number | null;
	totalStoreRevenue: number;
}

export interface RevenuePerSqftReport {
	months: string[];
	rows: BoothTrendRow[];
	/** store-wide: all booth revenue / all booth sq ft, per month */
	storeSeries: { month: string; storeRevenue: number; sqft: number; perSqft: number | null }[];
	totalSqft: number;
	note: string;
}

/** The last `count` COMPLETE Pacific calendar months, oldest first, as YYYY-MM. */
export function recentMonths(count: number, now: Date = new Date()): string[] {
	const { year, month } = getPacificDateParts(now);
	const out: string[] = [];
	let y = year;
	let m = month - 1; // previous month is the latest complete one
	for (let i = 0; i < count; i++) {
		if (m < 1) {
			m += 12;
			y -= 1;
		}
		out.unshift(`${y}-${String(m).padStart(2, '0')}`);
		m -= 1;
	}
	return out;
}

// drizzle 0.29 + postgres-js may return jsonb as a JSON string.
function parseIds(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw.map(String);
	if (typeof raw === 'string') {
		try {
			const p = JSON.parse(raw);
			return Array.isArray(p) ? p.map(String) : [];
		} catch {
			return [];
		}
	}
	return [];
}

/**
 * Pure: group vendors into booths. Every pool becomes one shared booth; any
 * remaining vendor with cells is a booth of its own. Vendors with no cells
 * and no pool are not booths (nothing to divide by).
 */
export function buildBooths(
	vendorRows: { nrsVendorId: number; displayName: string; code: string | null; monthlyRentCents: number | null }[],
	cellRows: { x: number; y: number; key: string; value: string }[],
	pools: { name: string; vendorIds: unknown }[]
): BoothDef[] {
	const byId = new Map(vendorRows.map((v) => [v.nrsVendorId, v]));
	const vendorCells = new Map<string, Set<string>>();
	const poolCells = new Map<string, Set<string>>();
	for (const r of cellRows) {
		const map = r.key === 'vendor_id' ? vendorCells : r.key === 'pool' ? poolCells : null;
		if (!map) continue;
		const set = map.get(r.value) ?? new Set<string>();
		set.add(`${r.x},${r.y}`);
		map.set(r.value, set);
	}

	const booths: BoothDef[] = [];
	const pooled = new Set<number>();

	for (const pool of pools) {
		const ids = parseIds(pool.vendorIds).filter((s) => /^\d+$/.test(s)).map(Number);
		const cells = new Set<string>(poolCells.get(pool.name) ?? []);
		for (const id of ids) for (const c of vendorCells.get(String(id)) ?? []) cells.add(c);
		const members = ids.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
		if (members.length === 0) continue;
		for (const id of ids) pooled.add(id);
		booths.push({
			key: `p:${pool.name}`,
			label: members.map((m) => m.code ?? String(m.nrsVendorId)).join(' + '),
			names: members.map((m) => m.displayName),
			vendorIds: members.map((m) => m.nrsVendorId),
			shared: true,
			sqft: cells.size,
			rent: members.reduce((a, m) => a + (m.monthlyRentCents ?? 0) / 100, 0)
		});
	}

	for (const [value, cells] of vendorCells) {
		if (!/^\d+$/.test(value)) continue;
		const id = Number(value);
		if (pooled.has(id)) continue;
		const v = byId.get(id);
		booths.push({
			key: `v:${id}`,
			label: v?.code ?? String(id),
			names: [v?.displayName ?? `NRS vendor ${id}`],
			vendorIds: [id],
			shared: false,
			sqft: cells.size,
			rent: (v?.monthlyRentCents ?? 0) / 100
		});
	}
	return booths;
}

/** Pure: fold monthly retained-by-vendor into per-booth rows + the store series. */
export function buildReport(
	booths: BoothDef[],
	months: string[],
	retainedByVendorMonth: Map<number, Map<string, number>>
): RevenuePerSqftReport {
	const rows: BoothTrendRow[] = booths.map((b) => {
		const bm: BoothMonth[] = months.map((month) => {
			const retained = b.vendorIds.reduce((a, id) => a + (retainedByVendorMonth.get(id)?.get(month) ?? 0), 0);
			const storeRevenue = retained + b.rent;
			return { month, retained, rent: b.rent, storeRevenue, perSqft: b.sqft > 0 ? storeRevenue / b.sqft : null };
		});
		const per = bm.map((m) => m.perSqft).filter((v): v is number => v !== null);
		const last = bm[bm.length - 1]?.perSqft ?? null;
		const avg = per.length ? per.reduce((a, v) => a + v, 0) / per.length : null;
		let trendPct: number | null = null;
		if (per.length >= 6) {
			const recent = per.slice(-3).reduce((a, v) => a + v, 0) / 3;
			const prior = per.slice(-6, -3).reduce((a, v) => a + v, 0) / 3;
			trendPct = prior > 0 ? ((recent - prior) / prior) * 100 : null;
		}
		return {
			...b,
			months: bm,
			lastPerSqft: last,
			avgPerSqft: avg,
			trendPct,
			totalStoreRevenue: bm.reduce((a, m) => a + m.storeRevenue, 0)
		};
	});

	const totalSqft = booths.reduce((a, b) => a + b.sqft, 0);
	const storeSeries = months.map((month, i) => {
		const storeRevenue = rows.reduce((a, r) => a + (r.months[i]?.storeRevenue ?? 0), 0);
		return { month, storeRevenue, sqft: totalSqft, perSqft: totalSqft > 0 ? storeRevenue / totalSqft : null };
	});

	return {
		months,
		rows,
		storeSeries,
		totalSqft,
		note: 'Sales are by calendar month (NRS daily snapshots). Rent and square footage are today\'s values applied to every month.'
	};
}

/** Latest snapshot per day → retained per vendor per YYYY-MM. */
export async function retainedByVendorByMonth(months: string[]): Promise<Map<number, Map<string, number>>> {
	const out = new Map<number, Map<string, number>>();
	if (months.length === 0) return out;
	const start = `${months[0]}-01`;
	const [ey, em] = months[months.length - 1].split('-').map(Number);
	const end = `${months[months.length - 1]}-${String(new Date(Date.UTC(ey, em, 0)).getUTCDate()).padStart(2, '0')}`;

	const snaps = await db
		.select({
			saleDate: sql<string>`TO_CHAR(${salesSnapshots.saleDate}, 'YYYY-MM-DD')`,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(and(gte(salesSnapshots.saleDate, start), lte(salesSnapshots.saleDate, end)))
		.orderBy(salesSnapshots.saleDate, salesSnapshots.capturedAt);

	// Later rows (higher capturedAt) overwrite earlier ones for the same day.
	const latestByDay = new Map<string, VendorSalesData[]>();
	for (const s of snaps) latestByDay.set(s.saleDate, s.vendors as VendorSalesData[]);

	for (const [day, dayVendors] of latestByDay) {
		const month = day.slice(0, 7);
		for (const v of dayVendors) {
			const id = parseInt(v.vendor_id, 10);
			if (!Number.isFinite(id) || id === 0) continue;
			const m = out.get(id) ?? new Map<string, number>();
			m.set(month, (m.get(month) ?? 0) + (v.retained_amount ?? 0));
			out.set(id, m);
		}
	}
	return out;
}

export async function revenuePerSqftReport(monthCount: number): Promise<RevenuePerSqftReport> {
	const months = recentMonths(monthCount);
	const plans = await db.select({ id: floorplanPlans.id }).from(floorplanPlans);
	if (plans.length === 0) return buildReport([], months, new Map());
	// One plan today; if more appear, booths are the union across plans.
	const planIds = plans.map((p) => p.id);
	const [vendorRows, cellRows, pools, retained] = await Promise.all([
		db
			.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName, code: vendors.inventoryCodePrefix, monthlyRentCents: vendors.monthlyRentCents })
			.from(vendors)
			.where(sql`${vendors.nrsVendorId} IS NOT NULL`),
		db
			.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y, key: floorplanCellAttrs.key, value: floorplanCellAttrs.value })
			.from(floorplanCellAttrs)
			.where(and(sql`${floorplanCellAttrs.planId} IN ${planIds}`, sql`${floorplanCellAttrs.key} IN ('vendor_id', 'pool')`)),
		db.select({ name: floorplanPools.name, vendorIds: floorplanPools.vendorIds }).from(floorplanPools),
		retainedByVendorByMonth(months)
	]);
	const booths = buildBooths(
		vendorRows.map((v) => ({ ...v, nrsVendorId: v.nrsVendorId! })),
		cellRows,
		pools
	);
	return buildReport(booths, months, retained);
}
