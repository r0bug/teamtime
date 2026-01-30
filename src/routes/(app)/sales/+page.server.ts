// Sales Dashboard - Server-side data loading
import type { PageServerLoad } from './$types';
import { db, salesSnapshots } from '$lib/server/db';
import { desc, gte, lte, and, sql } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	// Get last 30 days of sales data
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

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

	// Convert to array sorted by date ascending for charts
	const salesData = Array.from(dailyData.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([dateKey, s]) => ({
			date: dateKey,
			totalSales: parseFloat(s.totalSales),
			totalVendorAmount: parseFloat(s.totalVendorAmount),
			totalRetained: parseFloat(s.totalRetained),
			vendorCount: s.vendorCount,
			vendors: s.vendors as Array<{
				vendor_id: string;
				vendor_name: string;
				total_sales: number;
				vendor_amount: number;
				retained_amount: number;
			}>
		}));

	// Calculate summary stats
	const totalRetainedSum = salesData.reduce((sum, d) => sum + d.totalRetained, 0);
	const totalSalesSum = salesData.reduce((sum, d) => sum + d.totalSales, 0);
	const avgDailyRetained = salesData.length > 0 ? totalRetainedSum / salesData.length : 0;
	const avgDailySales = salesData.length > 0 ? totalSalesSum / salesData.length : 0;

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
	const weeklyData: Array<{ week: string; totalSales: number; totalRetained: number; days: number }> = [];
	const weekMap = new Map<string, { totalSales: number; totalRetained: number; days: number }>();

	for (const day of salesData) {
		const date = new Date(day.date);
		// Get Monday of the week
		const dayOfWeek = date.getDay();
		const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const monday = new Date(date.setDate(diff));
		const weekKey = monday.toISOString().split('T')[0];

		const existing = weekMap.get(weekKey) || { totalSales: 0, totalRetained: 0, days: 0 };
		existing.totalSales += day.totalSales;
		existing.totalRetained += day.totalRetained;
		existing.days += 1;
		weekMap.set(weekKey, existing);
	}

	for (const [week, data] of weekMap.entries()) {
		weeklyData.push({ week, ...data });
	}
	weeklyData.sort((a, b) => a.week.localeCompare(b.week));

	return {
		salesData,
		weeklyData,
		topVendors,
		summary: {
			totalRetained: totalRetainedSum,
			totalSales: totalSalesSum,
			avgDailyRetained,
			avgDailySales,
			daysWithData: salesData.length
		}
	};
};
