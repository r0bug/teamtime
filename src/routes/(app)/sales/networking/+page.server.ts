// Yakima Networking sales dashboard — a second, direct-sales location (NRS
// store 1) distinct from Yakima Finds. Manager-gated. Sales come from
// sales_transactions (store-scoped; YN has no snapshot rollup), labor is Dale's
// hours (the only YN worker) taken from time entries at the YN location.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db, salesTransactions, timeEntries, users } from '$lib/server/db';
import { and, eq, gte, gt, lt, or, isNull, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createPacificDateTime } from '$lib/server/utils/timezone';

// Yakima Networking = NRS store 1; TeamTime location f6eeb906 (Dale's location).
const YN_STORE_ID = 1;
const YN_LOCATION_ID = 'f6eeb906-d778-4f87-a566-8febe81a6067';

const ALLOWED_RANGE_DAYS = [7, 14, 30, 60, 90, 180, 365, 730] as const;
const DEFAULT_RANGE_DAYS = 30;

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		throw error(403, 'Managers only');
	}

	const daysParam = parseInt(url.searchParams.get('days') ?? '', 10);
	const rangeDays: number = ALLOWED_RANGE_DAYS.includes(daysParam as (typeof ALLOWED_RANGE_DAYS)[number])
		? daysParam
		: DEFAULT_RANGE_DAYS;

	const windowStartDate = new Date();
	windowStartDate.setDate(windowStartDate.getDate() - rangeDays);
	const windowStartStr = windowStartDate.toISOString().split('T')[0];

	// ---- Sales per day: aggregate store-1 transactions by invoice date ----
	const rows = await db
		.select({
			saleDate: salesTransactions.invoiceDate,
			total: sql<string>`sum(${salesTransactions.totalPrice})`,
			retained: sql<string>`sum(${salesTransactions.retainedAmountFromVendor})`,
			lines: sql<number>`count(*)::int`
		})
		.from(salesTransactions)
		.where(
			and(
				eq(salesTransactions.storeId, YN_STORE_ID),
				gte(salesTransactions.invoiceDate, windowStartStr)
			)
		)
		.groupBy(salesTransactions.invoiceDate);

	const dailySales = new Map<string, { total: number; retained: number; lines: number }>();
	for (const r of rows) {
		const saleDate = r.saleDate as string | Date;
		const dateKey = typeof saleDate === 'string' ? saleDate : saleDate.toISOString().split('T')[0];
		dailySales.set(dateKey, {
			total: parseFloat(r.total ?? '0') || 0,
			retained: parseFloat(r.retained ?? '0') || 0,
			lines: r.lines ?? 0
		});
	}

	// ---- Labor: Dale's hours (all time entries at the YN location) ----
	// Not filtered by include_in_labor_cost — Dale is excluded there for the YF
	// dashboard; here we specifically want his hours. Filter by location so a
	// future second YN worker is picked up automatically.
	const windowStart = createPacificDateTime(windowStartStr, 0, 0);
	const windowEnd = new Date();

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
				eq(timeEntries.locationId, YN_LOCATION_ID),
				lt(timeEntries.clockIn, windowEnd),
				or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, windowStart))
			)
		);

	const nowMs = Date.now();
	const parsedEntries: { startMs: number; endMs: number; rate: number }[] = [];
	for (const e of entryRows) {
		const rate = e.hourlyRate ? parseFloat(e.hourlyRate) : NaN;
		if (!Number.isFinite(rate) || rate <= 0) continue;
		const startMs = e.clockIn.getTime();
		const endMs = Math.min(e.clockOut ? e.clockOut.getTime() : nowMs, nowMs);
		if (endMs <= startMs) continue;
		parsedEntries.push({ startMs, endMs, rate });
	}

	function laborForDay(dateKey: string): number {
		const dayStart = createPacificDateTime(dateKey, 0, 0).getTime();
		const dayEnd = createPacificDateTime(dateKey, 24, 0).getTime();
		let total = 0;
		for (const e of parsedEntries) {
			const overlap = Math.min(e.endMs, dayEnd) - Math.max(e.startMs, dayStart);
			if (overlap > 0) total += (overlap / 3_600_000) * e.rate;
		}
		return total;
	}

	// ---- Combine: one row per day that had sales OR labor ----
	const allDates = new Set<string>([...dailySales.keys()]);
	// include labor-only days within the window (Dale worked but no sale)
	for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
		const key = d.toISOString().split('T')[0];
		if (laborForDay(key) > 0) allDates.add(key);
	}

	const salesData = Array.from(allDates)
		.sort((a, b) => a.localeCompare(b))
		.map((dateKey) => {
			const s = dailySales.get(dateKey);
			const totalSales = s?.total ?? 0;
			const labor = laborForDay(dateKey);
			return {
				date: dateKey,
				totalSales,
				lines: s?.lines ?? 0,
				labor,
				net: totalSales - labor
			};
		});

	const totalSalesSum = salesData.reduce((sum, d) => sum + d.totalSales, 0);
	const totalLaborSum = salesData.reduce((sum, d) => sum + d.labor, 0);
	const totalNetSum = totalSalesSum - totalLaborSum;
	const daysWithSales = salesData.filter((d) => d.totalSales > 0).length;

	// Weekly aggregation (Monday-anchored)
	const weekMap = new Map<string, { totalSales: number; labor: number; days: number }>();
	for (const day of salesData) {
		const date = new Date(day.date);
		const dow = date.getDay();
		const diff = date.getDate() - dow + (dow === 0 ? -6 : 1);
		const monday = new Date(date.setDate(diff));
		const weekKey = monday.toISOString().split('T')[0];
		const existing = weekMap.get(weekKey) || { totalSales: 0, labor: 0, days: 0 };
		existing.totalSales += day.totalSales;
		existing.labor += day.labor;
		existing.days += 1;
		weekMap.set(weekKey, existing);
	}
	const weeklyData = Array.from(weekMap.entries())
		.map(([week, d]) => ({ week, ...d, net: d.totalSales - d.labor }))
		.sort((a, b) => a.week.localeCompare(b.week));

	return {
		salesData,
		weeklyData,
		rangeDays,
		allowedRangeDays: ALLOWED_RANGE_DAYS as readonly number[],
		summary: {
			totalSales: totalSalesSum,
			totalLabor: totalLaborSum,
			totalNet: totalNetSum,
			avgDailySales: salesData.length ? totalSalesSum / salesData.length : 0,
			avgDailyNet: salesData.length ? totalNetSum / salesData.length : 0,
			daysWithData: salesData.length,
			daysWithSales
		}
	};
};
