// Booth economics for hover popovers: what the store earned from one booth
// last month, per square foot. Staff-only (the resolve endpoint gates it).
//
//   store revenue = store's retained share of the vendor's sales + booth rent
//   per sq ft     = store revenue / cells painted with the vendor's id
//
// "Last month" is the previous CALENDAR month in Pacific time (not a rolling
// 30 days) so the figure lines up with how rent is billed. Square footage is
// derived from the cell count on every call — never stored (schema rule).

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, vendors, salesTransactions } from '$lib/server/db';
import { aggregateValue } from '$lib/server/floorplan/core';
import { getPacificDateParts } from '$lib/server/utils/timezone';

export interface BoothRevenue {
	/** e.g. "Sep 2026" */
	monthLabel: string;
	sqft: number;
	grossSales: number;
	storeShare: number;
	rent: number;
	storeRevenue: number;
	/** null when the vendor has no painted cells */
	perSqft: number | null;
}

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

export async function boothRevenueLastMonth(planId: string, nrsVendorId: string): Promise<BoothRevenue | null> {
	if (!/^\d+$/.test(nrsVendorId)) return null;
	const id = Number(nrsVendorId);
	const { start, end, label } = previousMonthRange();

	const [agg, [sales], [vendor]] = await Promise.all([
		aggregateValue(planId, 'vendor_id', nrsVendorId),
		db
			.select({
				gross: sql<string>`coalesce(sum(${salesTransactions.totalPrice}), 0)`,
				retained: sql<string>`coalesce(sum(${salesTransactions.retainedAmountFromVendor}), 0)`
			})
			.from(salesTransactions)
			.where(
				and(
					eq(salesTransactions.vendorId, id),
					gte(salesTransactions.invoiceDate, start),
					lte(salesTransactions.invoiceDate, end)
				)
			),
		db
			.select({ monthlyRentCents: vendors.monthlyRentCents })
			.from(vendors)
			.where(eq(vendors.nrsVendorId, id))
			.orderBy(sql`${vendors.monthlyRentCents} desc nulls last`)
			.limit(1)
	]);

	const storeShare = Number(sales?.retained ?? 0);
	const rent = (vendor?.monthlyRentCents ?? 0) / 100;
	const storeRevenue = storeShare + rent;
	return {
		monthLabel: label,
		sqft: agg.cells,
		grossSales: Number(sales?.gross ?? 0),
		storeShare,
		rent,
		storeRevenue,
		perSqft: agg.cells > 0 ? storeRevenue / agg.cells : null
	};
}
