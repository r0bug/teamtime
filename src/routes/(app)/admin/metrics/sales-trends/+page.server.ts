import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { sql, gte, lte, and, eq, desc, isNotNull, inArray } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

interface VendorSalesData {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get date range from query params
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');
	const periodType = url.searchParams.get('period') || 'daily';
	const vendorFilters = url.searchParams.getAll('vendor');
	const employeeFilters = url.searchParams.getAll('employee');

	let startDate: Date;
	let endDate: Date;

	if (startParam && endParam) {
		startDate = new Date(startParam + 'T00:00:00');
		endDate = new Date(endParam + 'T23:59:59');
	} else {
		endDate = new Date();
		endDate.setHours(23, 59, 59, 999);
		startDate = new Date();
		startDate.setDate(startDate.getDate() - 30);
		startDate.setHours(0, 0, 0, 0);
	}

	// Get all sales snapshots in the date range
	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			totalSales: salesSnapshots.totalSales,
			totalRetained: salesSnapshots.totalRetained,
			totalVendorAmount: salesSnapshots.totalVendorAmount,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startDate.toISOString().split('T')[0]),
				lte(salesSnapshots.saleDate, endDate.toISOString().split('T')[0])
			)
		)
		.orderBy(salesSnapshots.saleDate);

	// Get time entries
	const entriesResult = await db
		.select({
			userId: timeEntries.userId,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				gte(timeEntries.clockIn, startDate),
				lte(timeEntries.clockIn, endDate),
				isNotNull(timeEntries.clockOut),
				...(employeeFilters.length > 0 ? [inArray(timeEntries.userId, employeeFilters)] : [])
			)
		);

	// Group time entries by date
	const hoursByDate = new Map<string, { totalHours: number; employees: Set<string> }>();
	for (const entry of entriesResult) {
		if (!entry.clockIn || !entry.clockOut) continue;

		const dateStr = new Date(entry.clockIn).toISOString().split('T')[0];
		const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);

		const existing = hoursByDate.get(dateStr);
		if (existing) {
			existing.totalHours += hours;
			existing.employees.add(entry.userId);
		} else {
			hoursByDate.set(dateStr, { totalHours: hours, employees: new Set([entry.userId]) });
		}
	}

	// Collect all unique vendors
	const vendorSet = new Map<string, string>();
	for (const snapshot of snapshots) {
		const vendors = snapshot.vendors as VendorSalesData[] || [];
		for (const v of vendors) {
			vendorSet.set(v.vendor_id, v.vendor_name);
		}
	}

	// Build trend data
	interface TrendDataPoint {
		date: string;
		periodLabel: string;
		totalSales: number;
		retained: number;
		vendorAmount: number;
		hoursWorked: number;
		salesPerHour: number;
		employeeCount: number;
		vendorBreakdown: { vendorId: string; vendorName: string; sales: number }[];
	}

	const trendData: TrendDataPoint[] = [];

	if (periodType === 'daily') {
		for (const snapshot of snapshots) {
			const hourData = hoursByDate.get(snapshot.saleDate) || { totalHours: 0, employees: new Set() };
			const vendors = snapshot.vendors as VendorSalesData[] || [];

			// Filter vendors if filters are applied
			let filteredVendors = vendors;
			if (vendorFilters.length > 0) {
				filteredVendors = vendors.filter(v => vendorFilters.includes(v.vendor_id));
			}

			const totalSales = filteredVendors.reduce((sum, v) => sum + v.total_sales, 0);
			const retained = filteredVendors.reduce((sum, v) => sum + (v.retained_amount || 0), 0) || parseFloat(snapshot.totalRetained || '0') * (filteredVendors.length / vendors.length);

			trendData.push({
				date: snapshot.saleDate,
				periodLabel: formatDate(snapshot.saleDate),
				totalSales: vendorFilters.length > 0 ? totalSales : parseFloat(snapshot.totalSales || '0'),
				retained: vendorFilters.length > 0 ? retained : parseFloat(snapshot.totalRetained || '0'),
				vendorAmount: parseFloat(snapshot.totalVendorAmount || '0'),
				hoursWorked: Math.round(hourData.totalHours * 100) / 100,
				salesPerHour: hourData.totalHours > 0 ? Math.round((parseFloat(snapshot.totalRetained || '0') / hourData.totalHours) * 100) / 100 : 0,
				employeeCount: hourData.employees.size,
				vendorBreakdown: filteredVendors.map(v => ({
					vendorId: v.vendor_id,
					vendorName: v.vendor_name,
					sales: v.total_sales
				}))
			});
		}
	} else if (periodType === 'weekly') {
		const weeklyData = new Map<string, {
			totalSales: number;
			retained: number;
			vendorAmount: number;
			totalHours: number;
			employees: Set<string>;
			vendors: Map<string, { name: string; sales: number }>;
			count: number;
		}>();

		for (const snapshot of snapshots) {
			const date = new Date(snapshot.saleDate + 'T00:00:00');
			const weekStart = new Date(date);
			weekStart.setDate(date.getDate() - date.getDay());
			const weekKey = weekStart.toISOString().split('T')[0];

			if (!weeklyData.has(weekKey)) {
				weeklyData.set(weekKey, {
					totalSales: 0,
					retained: 0,
					vendorAmount: 0,
					totalHours: 0,
					employees: new Set(),
					vendors: new Map(),
					count: 0
				});
			}

			const week = weeklyData.get(weekKey)!;
			const vendors = snapshot.vendors as VendorSalesData[] || [];

			let filteredVendors = vendors;
			if (vendorFilters.length > 0) {
				filteredVendors = vendors.filter(v => vendorFilters.includes(v.vendor_id));
			}

			week.totalSales += vendorFilters.length > 0
				? filteredVendors.reduce((sum, v) => sum + v.total_sales, 0)
				: parseFloat(snapshot.totalSales || '0');
			week.retained += parseFloat(snapshot.totalRetained || '0');
			week.vendorAmount += parseFloat(snapshot.totalVendorAmount || '0');
			week.count++;

			for (const v of filteredVendors) {
				const existing = week.vendors.get(v.vendor_id);
				if (existing) {
					existing.sales += v.total_sales;
				} else {
					week.vendors.set(v.vendor_id, { name: v.vendor_name, sales: v.total_sales });
				}
			}

			const hourData = hoursByDate.get(snapshot.saleDate);
			if (hourData) {
				week.totalHours += hourData.totalHours;
				hourData.employees.forEach(e => week.employees.add(e));
			}
		}

		for (const [weekKey, week] of weeklyData) {
			trendData.push({
				date: weekKey,
				periodLabel: `Week of ${formatDate(weekKey)}`,
				totalSales: Math.round(week.totalSales * 100) / 100,
				retained: Math.round(week.retained * 100) / 100,
				vendorAmount: Math.round(week.vendorAmount * 100) / 100,
				hoursWorked: Math.round(week.totalHours * 100) / 100,
				salesPerHour: week.totalHours > 0 ? Math.round((week.retained / week.totalHours) * 100) / 100 : 0,
				employeeCount: week.employees.size,
				vendorBreakdown: Array.from(week.vendors.entries()).map(([id, data]) => ({
					vendorId: id,
					vendorName: data.name,
					sales: data.sales
				}))
			});
		}

		trendData.sort((a, b) => a.date.localeCompare(b.date));
	} else if (periodType === 'monthly') {
		const monthlyData = new Map<string, {
			totalSales: number;
			retained: number;
			vendorAmount: number;
			totalHours: number;
			employees: Set<string>;
			vendors: Map<string, { name: string; sales: number }>;
			count: number;
		}>();

		for (const snapshot of snapshots) {
			const date = new Date(snapshot.saleDate + 'T00:00:00');
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

			if (!monthlyData.has(monthKey)) {
				monthlyData.set(monthKey, {
					totalSales: 0,
					retained: 0,
					vendorAmount: 0,
					totalHours: 0,
					employees: new Set(),
					vendors: new Map(),
					count: 0
				});
			}

			const month = monthlyData.get(monthKey)!;
			const vendors = snapshot.vendors as VendorSalesData[] || [];

			let filteredVendors = vendors;
			if (vendorFilters.length > 0) {
				filteredVendors = vendors.filter(v => vendorFilters.includes(v.vendor_id));
			}

			month.totalSales += vendorFilters.length > 0
				? filteredVendors.reduce((sum, v) => sum + v.total_sales, 0)
				: parseFloat(snapshot.totalSales || '0');
			month.retained += parseFloat(snapshot.totalRetained || '0');
			month.vendorAmount += parseFloat(snapshot.totalVendorAmount || '0');
			month.count++;

			for (const v of filteredVendors) {
				const existing = month.vendors.get(v.vendor_id);
				if (existing) {
					existing.sales += v.total_sales;
				} else {
					month.vendors.set(v.vendor_id, { name: v.vendor_name, sales: v.total_sales });
				}
			}

			const hourData = hoursByDate.get(snapshot.saleDate);
			if (hourData) {
				month.totalHours += hourData.totalHours;
				hourData.employees.forEach(e => month.employees.add(e));
			}
		}

		for (const [monthKey, month] of monthlyData) {
			trendData.push({
				date: monthKey,
				periodLabel: formatMonthYear(monthKey),
				totalSales: Math.round(month.totalSales * 100) / 100,
				retained: Math.round(month.retained * 100) / 100,
				vendorAmount: Math.round(month.vendorAmount * 100) / 100,
				hoursWorked: Math.round(month.totalHours * 100) / 100,
				salesPerHour: month.totalHours > 0 ? Math.round((month.retained / month.totalHours) * 100) / 100 : 0,
				employeeCount: month.employees.size,
				vendorBreakdown: Array.from(month.vendors.entries()).map(([id, data]) => ({
					vendorId: id,
					vendorName: data.name,
					sales: data.sales
				}))
			});
		}

		trendData.sort((a, b) => a.date.localeCompare(b.date));
	}

	// Get list of employees for filter
	const employeeList = await db
		.select({
			id: users.id,
			name: users.name
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	// Get unique vendors for filter
	const vendorList = Array.from(vendorSet.entries()).map(([id, name]) => ({
		id,
		name
	})).sort((a, b) => a.name.localeCompare(b.name));

	// Calculate summary stats
	const totalSales = trendData.reduce((sum, d) => sum + d.totalSales, 0);
	const totalRetained = trendData.reduce((sum, d) => sum + d.retained, 0);
	const totalHours = trendData.reduce((sum, d) => sum + d.hoursWorked, 0);
	const avgSalesPerHour = totalHours > 0 ? totalRetained / totalHours : 0;

	// Calculate trend (compare first half to second half)
	let trend = 0;
	if (trendData.length >= 2) {
		const midpoint = Math.floor(trendData.length / 2);
		const firstHalf = trendData.slice(0, midpoint);
		const secondHalf = trendData.slice(midpoint);
		const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.totalSales, 0) / firstHalf.length;
		const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.totalSales, 0) / secondHalf.length;
		trend = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
	}

	return {
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		periodType,
		vendorFilters,
		employeeFilters,
		trendData,
		employeeList,
		vendorList,
		summary: {
			totalSales: Math.round(totalSales * 100) / 100,
			totalRetained: Math.round(totalRetained * 100) / 100,
			totalHours: Math.round(totalHours * 100) / 100,
			avgSalesPerHour: Math.round(avgSalesPerHour * 100) / 100,
			periodCount: trendData.length,
			trend: Math.round(trend * 10) / 10
		}
	};
};

function formatDate(dateStr: string): string {
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}

function formatMonthYear(dateStr: string): string {
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric'
	});
}
