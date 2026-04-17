// Sales Detail - Server-side data for drill-down views (hourly, vendor, item)
import type { PageServerLoad } from './$types';
import {
	db,
	salesTransactions,
	timeEntries,
	users,
	storeHours,
	locations
} from '$lib/server/db';
import { eq, gte, lte, and, sql, desc, or, isNull, lt, gt } from 'drizzle-orm';
import { createPacificDateTime, getPacificWeekday } from '$lib/server/utils/timezone';

// Default operational hours used when store_hours is not configured for the weekday
const DEFAULT_OPEN_HOUR = 9;
const DEFAULT_CLOSE_HOUR = 18;

function parseHHMM(s: string | null | undefined): number | null {
	if (!s) return null;
	const [hStr] = s.split(':');
	const h = Number(hStr);
	return Number.isFinite(h) ? h : null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const date = url.searchParams.get('date');
	const vendorId = url.searchParams.get('vendorId');

	// Default to today if no date
	const targetDate = date || new Date().toISOString().split('T')[0];

	// Build conditions for filtered (vendor-scoped) sales queries
	const conditions = [eq(salesTransactions.invoiceDate, targetDate)];
	if (vendorId) {
		conditions.push(eq(salesTransactions.vendorId, parseInt(vendorId, 10)));
	}
	const where = and(...conditions);

	// Hourly sales aggregation (leading-hour bucket: EXTRACT(HOUR) = H means
	// sale at [H:00, H+1:00)). The UI relabels this as the trailing hour
	// (label = H + 1) so a sale at 11:15 shows under the "12:00" row — and
	// labor for that same row covers the 11:00–12:00 window.
	const hourlyData = await db
		.select({
			leadHour: sql<number>`EXTRACT(HOUR FROM ${salesTransactions.createDateTime} AT TIME ZONE 'America/Los_Angeles')`.as('lead_hour'),
			totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
			vendorPortion: sql<string>`SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric)`.as('vendor_portion'),
			retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
			itemCount: sql<number>`COUNT(*)`.as('item_count'),
			vendorCount: sql<number>`COUNT(DISTINCT ${salesTransactions.vendorId})`.as('vendor_count')
		})
		.from(salesTransactions)
		.where(where)
		.groupBy(sql`EXTRACT(HOUR FROM ${salesTransactions.createDateTime} AT TIME ZONE 'America/Los_Angeles')`)
		.orderBy(sql`EXTRACT(HOUR FROM ${salesTransactions.createDateTime} AT TIME ZONE 'America/Los_Angeles')`);

	// Vendor aggregation (for this date, regardless of vendorId filter)
	const dateCondition = eq(salesTransactions.invoiceDate, targetDate);
	const vendorData = await db
		.select({
			vendorId: salesTransactions.vendorId,
			vendorName: sql<string>`MAX(${salesTransactions.vendorName})`.as('vendor_name'),
			totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
			vendorPortion: sql<string>`SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric)`.as('vendor_portion'),
			retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
			itemCount: sql<number>`COUNT(*)`.as('item_count')
		})
		.from(salesTransactions)
		.where(dateCondition)
		.groupBy(salesTransactions.vendorId)
		.orderBy(sql`SUM(${salesTransactions.totalPrice}::numeric) DESC`);

	// Recent individual items (top 50)
	const items = await db
		.select({
			id: salesTransactions.id,
			createDateTime: salesTransactions.createDateTime,
			vendorId: salesTransactions.vendorId,
			vendorName: salesTransactions.vendorName,
			itemDescription: salesTransactions.itemDescription,
			partNumber: salesTransactions.partNumber,
			quantity: salesTransactions.quantity,
			price: salesTransactions.price,
			totalPrice: salesTransactions.totalPrice,
			vendorPortion: salesTransactions.vendorPortionOfTotalPrice,
			retained: salesTransactions.retainedAmountFromVendor,
			userName: salesTransactions.userName
		})
		.from(salesTransactions)
		.where(where)
		.orderBy(desc(salesTransactions.createDateTime))
		.limit(50);

	// Totals for the day (sales side only — labor is added below)
	const [dayTotals] = await db
		.select({
			totalSales: sql<string>`COALESCE(SUM(${salesTransactions.totalPrice}::numeric), 0)`.as('total_sales'),
			vendorPortion: sql<string>`COALESCE(SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric), 0)`.as('vendor_portion'),
			retained: sql<string>`COALESCE(SUM(${salesTransactions.retainedAmountFromVendor}::numeric), 0)`.as('retained'),
			itemCount: sql<number>`COUNT(*)`.as('item_count'),
			vendorCount: sql<number>`COUNT(DISTINCT ${salesTransactions.vendorId})`.as('vendor_count')
		})
		.from(salesTransactions)
		.where(where);

	// Available dates (for date picker navigation)
	const availableDates = await db
		.selectDistinct({ date: sql<string>`${salesTransactions.invoiceDate}::text`.as('date_str') })
		.from(salesTransactions)
		.orderBy(sql`${salesTransactions.invoiceDate}::text DESC`)
		.limit(30);

	// ------------------------------------------------------------------
	// Labor cost computation
	// ------------------------------------------------------------------

	// Weekday of target date in Pacific time
	const dayStart = createPacificDateTime(targetDate, 0, 0);
	const dayEnd = createPacificDateTime(targetDate, 24, 0);
	const weekday = getPacificWeekday(dayStart);

	// Operational window: earliest open → latest close across active
	// locations for the weekday. Falls back to 09:00–18:00 if unconfigured.
	const storeHoursRows = await db
		.select({ openTime: storeHours.openTime, closeTime: storeHours.closeTime })
		.from(storeHours)
		.innerJoin(locations, eq(storeHours.locationId, locations.id))
		.where(
			and(
				eq(storeHours.dayOfWeek, weekday),
				eq(storeHours.isClosed, false),
				eq(locations.isActive, true)
			)
		);

	const opens = storeHoursRows.map(r => parseHHMM(r.openTime)).filter((h): h is number => h !== null);
	const closes = storeHoursRows.map(r => parseHHMM(r.closeTime)).filter((h): h is number => h !== null);
	const openHour = opens.length > 0 ? Math.min(...opens) : DEFAULT_OPEN_HOUR;
	const closeHour = closes.length > 0 ? Math.max(...closes) : DEFAULT_CLOSE_HOUR;

	// Time entries overlapping this Pacific day — include entries that clocked
	// in before day-end and either haven't clocked out or clocked out after day-start
	const entryRows = await db
		.select({
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			hourlyRate: users.hourlyRate
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				lt(timeEntries.clockIn, dayEnd),
				or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, dayStart))
			)
		);

	// Clamp clockOut to "now" for still-active entries so future hours don't
	// charge labor that hasn't happened yet.
	const now = new Date();
	type ParsedEntry = { startMs: number; endMs: number; rate: number };
	const parsedEntries: ParsedEntry[] = [];
	let unknownRateEntries = 0;
	for (const e of entryRows) {
		const rate = e.hourlyRate ? parseFloat(e.hourlyRate) : NaN;
		if (!Number.isFinite(rate) || rate <= 0) {
			unknownRateEntries++;
			continue;
		}
		const startMs = new Date(e.clockIn).getTime();
		const endMs = e.clockOut ? new Date(e.clockOut).getTime() : now.getTime();
		if (endMs <= startMs) continue;
		parsedEntries.push({ startMs, endMs, rate });
	}

	function laborForWindow(windowStartMs: number, windowEndMs: number): number {
		let cost = 0;
		for (const e of parsedEntries) {
			const overlapStart = Math.max(e.startMs, windowStartMs);
			const overlapEnd = Math.min(e.endMs, windowEndMs);
			if (overlapEnd > overlapStart) {
				cost += ((overlapEnd - overlapStart) / 3_600_000) * e.rate;
			}
		}
		return cost;
	}

	// Build sales-by-leading-hour map so we can merge with label-hour rows
	const salesByLeadHour = new Map<
		number,
		{
			totalSales: number;
			vendorPortion: number;
			retained: number;
			itemCount: number;
			vendorCount: number;
		}
	>();
	for (const r of hourlyData) {
		salesByLeadHour.set(Number(r.leadHour), {
			totalSales: parseFloat(r.totalSales),
			vendorPortion: parseFloat(r.vendorPortion),
			retained: parseFloat(r.retained),
			itemCount: Number(r.itemCount),
			vendorCount: Number(r.vendorCount)
		});
	}

	// Label-hour range: [openHour, closeHour] inclusive. Label H represents
	// the window [H-1:00, H:00), so openHour=11 produces a first row at 11:00
	// covering 10:00–11:00 (pre-open labor only).
	const labelHours = new Set<number>();
	for (let h = openHour; h <= closeHour; h++) labelHours.add(h);
	// Also surface any hour outside the operational range that had sales,
	// so the hourly table always sums to the day total.
	for (const leadHour of salesByLeadHour.keys()) {
		labelHours.add(leadHour + 1);
	}

	const hourly = Array.from(labelHours)
		.sort((a, b) => a - b)
		.map(labelHour => {
			const leadHour = labelHour - 1;
			const winStart = createPacificDateTime(targetDate, leadHour, 0).getTime();
			const winEnd = createPacificDateTime(targetDate, labelHour, 0).getTime();
			const labor = laborForWindow(winStart, winEnd);
			const sales = salesByLeadHour.get(leadHour) ?? {
				totalSales: 0,
				vendorPortion: 0,
				retained: 0,
				itemCount: 0,
				vendorCount: 0
			};
			return {
				hour: labelHour,
				totalSales: sales.totalSales,
				vendorPortion: sales.vendorPortion,
				retained: sales.retained,
				itemCount: sales.itemCount,
				vendorCount: sales.vendorCount,
				labor,
				net: sales.retained - labor
			};
		});

	// Day-total labor = sum of all entry overlap with the full Pacific day
	const totalLabor = laborForWindow(dayStart.getTime(), dayEnd.getTime());
	const totalRetained = parseFloat(dayTotals.retained);

	return {
		date: targetDate,
		selectedVendorId: vendorId ? parseInt(vendorId, 10) : null,
		hourly,
		vendors: vendorData.map(r => ({
			vendorId: r.vendorId,
			vendorName: r.vendorName,
			totalSales: parseFloat(r.totalSales),
			vendorPortion: parseFloat(r.vendorPortion),
			retained: parseFloat(r.retained),
			itemCount: Number(r.itemCount)
		})),
		items: items.map(r => ({
			id: r.id,
			time: r.createDateTime?.toISOString() || '',
			vendorId: r.vendorId,
			vendorName: r.vendorName,
			itemDescription: r.itemDescription,
			partNumber: r.partNumber,
			quantity: r.quantity,
			price: parseFloat(r.price),
			totalPrice: parseFloat(r.totalPrice),
			vendorPortion: parseFloat(r.vendorPortion),
			retained: parseFloat(r.retained),
			userName: r.userName
		})),
		totals: {
			totalSales: parseFloat(dayTotals.totalSales),
			vendorPortion: parseFloat(dayTotals.vendorPortion),
			retained: totalRetained,
			itemCount: Number(dayTotals.itemCount),
			vendorCount: Number(dayTotals.vendorCount),
			labor: totalLabor,
			net: totalRetained - totalLabor
		},
		operationalHours: { openHour, closeHour },
		laborMeta: { unknownRateEntries },
		availableDates: availableDates.map(d => String(d.date))
	};
};
