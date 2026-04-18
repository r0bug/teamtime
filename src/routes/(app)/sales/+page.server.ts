// Sales Dashboard - Server-side data loading
import type { PageServerLoad } from './$types';
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { desc, gte, lte, and, or, isNull, gt, lt, eq, sql } from 'drizzle-orm';
import { createPacificDateTime } from '$lib/server/utils/timezone';

const ALLOWED_RANGE_DAYS = [7, 14, 30, 60, 90, 180, 365, 730] as const;
const DEFAULT_RANGE_DAYS = 30;

export const load: PageServerLoad = async ({ url, locals }) => {
	// Range window, clamped to the allowed set to avoid unbounded queries
	const daysParam = parseInt(url.searchParams.get('days') ?? '', 10);
	const rangeDays: number = ALLOWED_RANGE_DAYS.includes(daysParam as (typeof ALLOWED_RANGE_DAYS)[number])
		? daysParam
		: DEFAULT_RANGE_DAYS;

	const windowStartDate = new Date();
	windowStartDate.setDate(windowStartDate.getDate() - rangeDays);
	const thirtyDaysAgoStr = windowStartDate.toISOString().split('T')[0];

	// Get daily snapshots (latest per day)
	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			capturedAt: salesSnapshots.capturedAt,
			totalSales: salesSnapshots.totalSales,
			totalVendorAmount: salesSnapshots.totalVendorAmount,
			totalRetained: salesSnapshots.totalRetained,
			vendorCount: salesSnapshots.vendorCount,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(gte(salesSnapshots.saleDate, thirtyDaysAgoStr))
		.orderBy(desc(salesSnapshots.saleDate), desc(salesSnapshots.capturedAt));

	// Dedupe to get latest snapshot per day
	// Note: saleDate from DB might be a Date object or string depending on driver
	const dailyData = new Map<string, typeof snapshots[0]>();
	for (const snapshot of snapshots) {
		const saleDate = snapshot.saleDate as string | Date;
		const dateKey = typeof saleDate === 'string'
			? saleDate
			: saleDate.toISOString().split('T')[0];
		if (!dailyData.has(dateKey)) {
			dailyData.set(dateKey, snapshot);
		}
	}

	// ---- Labor cost per day (30-day window) ----
	// Pull every time entry overlapping the window, join user for rate + include flag,
	// then bucket labor by Pacific-day overlap in JS.
	const windowStart = createPacificDateTime(thirtyDaysAgoStr, 0, 0);
	const windowEnd = new Date(); // up to "now" — no future labor

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
				lt(timeEntries.clockIn, windowEnd),
				or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, windowStart)),
				eq(users.includeInLaborCost, true)
			)
		);

	const nowMs = Date.now();
	type ParsedEntry = { startMs: number; endMs: number; rate: number };
	const parsedEntries: ParsedEntry[] = [];
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

	// Convert to array sorted by date ascending for charts
	const salesData = Array.from(dailyData.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([dateKey, s]) => {
			const totalSales = parseFloat(s.totalSales);
			const totalRetained = parseFloat(s.totalRetained);
			const labor = laborForDay(dateKey);
			return {
				date: dateKey,
				totalSales,
				totalVendorAmount: parseFloat(s.totalVendorAmount),
				totalRetained,
				labor,
				net: totalRetained - labor,
				vendorCount: s.vendorCount,
				vendors: s.vendors as Array<{
					vendor_id: string;
					vendor_name: string;
					total_sales: number;
					vendor_amount: number;
					retained_amount: number;
				}>
			};
		});

	// Calculate summary stats
	const totalRetainedSum = salesData.reduce((sum, d) => sum + d.totalRetained, 0);
	const totalSalesSum = salesData.reduce((sum, d) => sum + d.totalSales, 0);
	const totalLaborSum = salesData.reduce((sum, d) => sum + d.labor, 0);
	const totalNetSum = totalRetainedSum - totalLaborSum;
	const avgDailyRetained = salesData.length > 0 ? totalRetainedSum / salesData.length : 0;
	const avgDailySales = salesData.length > 0 ? totalSalesSum / salesData.length : 0;
	const avgDailyLabor = salesData.length > 0 ? totalLaborSum / salesData.length : 0;
	const avgDailyNet = salesData.length > 0 ? totalNetSum / salesData.length : 0;

	// Get top vendors across all days
	const vendorTotals = new Map<string, { name: string; sales: number; retained: number }>();
	for (const day of salesData) {
		for (const v of day.vendors) {
			const existing = vendorTotals.get(v.vendor_id) || { name: v.vendor_name, sales: 0, retained: 0 };
			existing.sales += v.total_sales;
			existing.retained += v.retained_amount;
			vendorTotals.set(v.vendor_id, existing);
		}
	}

	const topVendors = Array.from(vendorTotals.entries())
		.map(([id, data]) => ({ id, ...data }))
		.sort((a, b) => b.sales - a.sales)
		.slice(0, 10);

	// Weekly aggregation
	const weeklyData: Array<{ week: string; totalSales: number; totalRetained: number; labor: number; net: number; days: number }> = [];
	const weekMap = new Map<string, { totalSales: number; totalRetained: number; labor: number; days: number }>();

	for (const day of salesData) {
		const date = new Date(day.date);
		// Get Monday of the week
		const dayOfWeek = date.getDay();
		const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const monday = new Date(date.setDate(diff));
		const weekKey = monday.toISOString().split('T')[0];

		const existing = weekMap.get(weekKey) || { totalSales: 0, totalRetained: 0, labor: 0, days: 0 };
		existing.totalSales += day.totalSales;
		existing.totalRetained += day.totalRetained;
		existing.labor += day.labor;
		existing.days += 1;
		weekMap.set(weekKey, existing);
	}

	for (const [week, data] of weekMap.entries()) {
		weeklyData.push({ week, ...data, net: data.totalRetained - data.labor });
	}
	weeklyData.sort((a, b) => a.week.localeCompare(b.week));

	return {
		salesData,
		weeklyData,
		topVendors,
		rangeDays,
		allowedRangeDays: ALLOWED_RANGE_DAYS as readonly number[],
		summary: {
			totalRetained: totalRetainedSum,
			totalSales: totalSalesSum,
			totalLabor: totalLaborSum,
			totalNet: totalNetSum,
			avgDailyRetained,
			avgDailySales,
			avgDailyLabor,
			avgDailyNet,
			daysWithData: salesData.length
		}
	};
};
