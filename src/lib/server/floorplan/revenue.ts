// Booth economics for hover popovers: what the store earned from one booth
// last month, per square foot. Staff-only (the resolve endpoint gates it).
//
//   store revenue = store's retained share of the occupants' sales + booth rent
//   per sq ft     = store revenue / cells in the booth
//
// A booth normally has one occupant (the vendor_id painted on its cells). A
// SHARED booth is a vendor pool: every member is an occupant, so the booth's
// cells are those painted with any member's vendor_id OR with the pool name,
// and sales/rent are summed across members (only one of them may pay rent;
// the space still earns all of their sales). Sales are also reported per
// occupant so the popover can show who sold what.
//
// "Last month" is the previous CALENDAR month in Pacific time (not a rolling
// 30 days) so the figure lines up with how rent is billed. Square footage is
// derived from the cell count on every call — never stored (schema rule).

import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { db, vendors, salesTransactions, floorplanPools, floorplanCellAttrs, type FloorplanPool } from '$lib/server/db';
import { getPacificDateParts } from '$lib/server/utils/timezone';

/** First/last day (YYYY-MM-DD) of the previous Pacific calendar month. */
export function previousMonthRange(now: Date = new Date()): { start: string; end: string; label: string } {
	const { year, month } = getPacificDateParts(now); // month is 1-based
	const y = month === 1 ? year - 1 : year;
	const m = month === 1 ? 12 : month - 1;
	const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
	const mm = String(m).padStart(2, '0');
	const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
	return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`, label };
}

// ── Shared booths (pools as co-tenant groups) ───────────────────────────────

export interface BoothOccupant {
	nrsVendorId: number;
	/** NRS vendor code / TT inventory prefix, e.g. 'ROSIE'. */
	code: string | null;
	name: string;
	grossSales: number;
	storeShare: number;
	rent: number;
}

export interface BoothEconomics {
	monthLabel: string;
	/** true when the booth is a pool (more than one occupant or pool-painted cells) */
	shared: boolean;
	poolNames: string[];
	sqft: number;
	occupants: BoothOccupant[];
	grossSales: number;
	storeShare: number;
	rent: number;
	storeRevenue: number;
	perSqft: number | null;
}

// drizzle 0.29 + postgres-js may return jsonb as a JSON string.
function poolMemberIds(pool: Pick<FloorplanPool, 'vendorIds'>): string[] {
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

/**
 * Who occupies the booth a cell belongs to. A `pool` attr names the pool
 * directly; a `vendor_id` attr pulls in every pool that vendor is a member
 * of (so a shared space painted under one tenant still resolves both).
 */
export async function boothOccupantsForCell(
	planId: string,
	attrs: Record<string, string>
): Promise<{ vendorIds: string[]; poolNames: string[] }> {
	const pools = await db.select().from(floorplanPools).where(eq(floorplanPools.planId, planId));
	const vendorIds = new Set<string>();
	const poolNames = new Set<string>();

	if (attrs.pool !== undefined) {
		const pool = pools.find((p) => p.name === attrs.pool);
		if (pool) {
			poolNames.add(pool.name);
			for (const id of poolMemberIds(pool)) vendorIds.add(id);
		}
	}
	if (attrs.vendor_id !== undefined && /^\d+$/.test(attrs.vendor_id)) {
		vendorIds.add(attrs.vendor_id);
		for (const pool of pools) {
			const members = poolMemberIds(pool);
			if (members.includes(attrs.vendor_id)) {
				poolNames.add(pool.name);
				for (const id of members) vendorIds.add(id);
			}
		}
	}
	return { vendorIds: [...vendorIds].filter((v) => /^\d+$/.test(v)), poolNames: [...poolNames] };
}

/** Pure: fold per-occupant figures + cell count into the booth totals. */
export function summarizeBooth(
	monthLabel: string,
	occupants: BoothOccupant[],
	sqft: number,
	poolNames: string[]
): BoothEconomics {
	const grossSales = occupants.reduce((a, o) => a + o.grossSales, 0);
	const storeShare = occupants.reduce((a, o) => a + o.storeShare, 0);
	const rent = occupants.reduce((a, o) => a + o.rent, 0);
	const storeRevenue = storeShare + rent;
	return {
		monthLabel,
		shared: occupants.length > 1 || poolNames.length > 0,
		poolNames,
		sqft,
		occupants,
		grossSales,
		storeShare,
		rent,
		storeRevenue,
		perSqft: sqft > 0 ? storeRevenue / sqft : null
	};
}

/**
 * Last-month economics for the booth containing the given occupants: cells
 * painted with any occupant's vendor_id or any of the pool names, every
 * occupant's sales (reported separately AND summed), and all rent.
 */
export async function boothEconomicsLastMonth(
	planId: string,
	occupantIds: string[],
	poolNames: string[]
): Promise<BoothEconomics | null> {
	const ids = [...new Set(occupantIds)].filter((v) => /^\d+$/.test(v)).map(Number);
	if (ids.length === 0 && poolNames.length === 0) return null;
	const { start, end, label } = previousMonthRange();

	const cellConds = [];
	if (ids.length) cellConds.push(and(eq(floorplanCellAttrs.key, 'vendor_id'), inArray(floorplanCellAttrs.value, ids.map(String))));
	if (poolNames.length) cellConds.push(and(eq(floorplanCellAttrs.key, 'pool'), inArray(floorplanCellAttrs.value, poolNames)));

	const [[cellRow], vendorRows, salesRows] = await Promise.all([
		db
			.select({ cells: sql<number>`count(distinct (${floorplanCellAttrs.x}, ${floorplanCellAttrs.y}))::int` })
			.from(floorplanCellAttrs)
			.where(and(eq(floorplanCellAttrs.planId, planId), or(...cellConds))),
		ids.length
			? db
					.select({
						nrsVendorId: vendors.nrsVendorId,
						displayName: vendors.displayName,
						code: vendors.inventoryCodePrefix,
						monthlyRentCents: vendors.monthlyRentCents
					})
					.from(vendors)
					.where(inArray(vendors.nrsVendorId, ids))
			: Promise.resolve([]),
		ids.length
			? db
					.select({
						vendorId: salesTransactions.vendorId,
						gross: sql<string>`coalesce(sum(${salesTransactions.totalPrice}), 0)`,
						retained: sql<string>`coalesce(sum(${salesTransactions.retainedAmountFromVendor}), 0)`
					})
					.from(salesTransactions)
					.where(
						and(
							inArray(salesTransactions.vendorId, ids),
							gte(salesTransactions.invoiceDate, start),
							lte(salesTransactions.invoiceDate, end)
						)
					)
					.groupBy(salesTransactions.vendorId)
			: Promise.resolve([])
	]);

	const salesById = new Map(salesRows.map((r) => [r.vendorId, r]));
	const occupants: BoothOccupant[] = ids.map((id) => {
		const v = vendorRows.find((r) => r.nrsVendorId === id);
		const sale = salesById.get(id);
		return {
			nrsVendorId: id,
			code: v?.code ?? null,
			name: v?.displayName ?? `NRS vendor ${id}`,
			grossSales: Number(sale?.gross ?? 0),
			storeShare: Number(sale?.retained ?? 0),
			rent: (v?.monthlyRentCents ?? 0) / 100
		};
	});
	// Rent payers first, then by sales — the person on the lease leads the list.
	occupants.sort((a, b) => b.rent - a.rent || b.grossSales - a.grossSales);

	return summarizeBooth(label, occupants, cellRow?.cells ?? 0, poolNames);
}
