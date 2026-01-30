import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { sql, gte, lte, and, eq, desc, count } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get date range from query params
	const rangeParam = url.searchParams.get('range') || '7';
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');
	const metricType = url.searchParams.get('metric') || 'sales';
	const userFilter = url.searchParams.get('user') || '';
	const vendorFilter = url.searchParams.get('vendor') || '';

	let startDate: Date;
	let endDate: Date;

	if (startParam && endParam) {
		startDate = new Date(startParam + 'T00:00:00');
		endDate = new Date(endParam + 'T23:59:59');
	} else {
		endDate = new Date();
		endDate.setHours(23, 59, 59, 999);
		startDate = new Date();
		startDate.setDate(startDate.getDate() - parseInt(rangeParam));
		startDate.setHours(0, 0, 0, 0);
	}

	// Get sales snapshots for the date range
	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			totalSales: salesSnapshots.totalSales,
			totalVendorAmount: salesSnapshots.totalVendorAmount,
			totalRetained: salesSnapshots.totalRetained,
			vendorCount: salesSnapshots.vendorCount,
			vendors: salesSnapshots.vendors,
			source: salesSnapshots.source,
			capturedAt: salesSnapshots.capturedAt
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startDate.toISOString().split('T')[0]),
				lte(salesSnapshots.saleDate, endDate.toISOString().split('T')[0])
			)
		)
		.orderBy(desc(salesSnapshots.saleDate));

	// Get time entries for the date range
	const timeEntriesData = await db
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
				lte(timeEntries.clockIn, endDate)
			)
		)
		.orderBy(desc(timeEntries.clockIn));

	// Calculate summary stats
	const totalSales = snapshots.reduce((sum, s) => sum + parseFloat(s.totalSales || '0'), 0);
	const totalRetained = snapshots.reduce((sum, s) => sum + parseFloat(s.totalRetained || '0'), 0);
	const totalVendorAmount = snapshots.reduce((sum, s) => sum + parseFloat(s.totalVendorAmount || '0'), 0);
	const daysWithData = snapshots.length;

	// Calculate total hours worked
	let totalHours = 0;
	for (const entry of timeEntriesData) {
		if (entry.clockIn && entry.clockOut) {
			const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
			totalHours += hours;
		}
	}

	// Get unique employees
	const uniqueEmployees = new Set(timeEntriesData.map(e => e.userId));

	// Get unique vendors from snapshots
	const vendorSet = new Map<string, { name: string; totalSales: number; count: number }>();
	for (const snapshot of snapshots) {
		const vendors = snapshot.vendors as { vendor_id: string; vendor_name: string; total_sales: number }[] || [];
		for (const vendor of vendors) {
			const existing = vendorSet.get(vendor.vendor_id);
			if (existing) {
				existing.totalSales += vendor.total_sales;
				existing.count++;
			} else {
				vendorSet.set(vendor.vendor_id, {
					name: vendor.vendor_name,
					totalSales: vendor.total_sales,
					count: 1
				});
			}
		}
	}

	const vendorList = Array.from(vendorSet.entries()).map(([id, data]) => ({
		id,
		name: data.name,
		totalSales: data.totalSales,
		daysActive: data.count
	})).sort((a, b) => b.totalSales - a.totalSales);

	// Build metrics data for table
	let metricsData: Array<{
		date: string;
		totalSales: number;
		retained: number;
		vendorAmount: number;
		vendorCount: number;
		hoursWorked: number;
		employeeCount: number;
		salesPerHour: number;
	}> = [];

	// Group time entries by date
	const hoursByDate = new Map<string, { hours: number; employees: Set<string> }>();
	for (const entry of timeEntriesData) {
		if (entry.clockIn && entry.clockOut) {
			const dateStr = new Date(entry.clockIn).toISOString().split('T')[0];
			const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
			const existing = hoursByDate.get(dateStr);
			if (existing) {
				existing.hours += hours;
				existing.employees.add(entry.userId);
			} else {
				hoursByDate.set(dateStr, { hours, employees: new Set([entry.userId]) });
			}
		}
	}

	for (const snapshot of snapshots) {
		const hourData = hoursByDate.get(snapshot.saleDate) || { hours: 0, employees: new Set() };
		const retained = parseFloat(snapshot.totalRetained || '0');
		const salesPerHour = hourData.hours > 0 ? retained / hourData.hours : 0;

		metricsData.push({
			date: snapshot.saleDate,
			totalSales: parseFloat(snapshot.totalSales || '0'),
			retained: retained,
			vendorAmount: parseFloat(snapshot.totalVendorAmount || '0'),
			vendorCount: snapshot.vendorCount,
			hoursWorked: Math.round(hourData.hours * 100) / 100,
			employeeCount: hourData.employees.size,
			salesPerHour: Math.round(salesPerHour * 100) / 100
		});
	}

	// Get list of users for filter dropdown
	const usersList = await db
		.select({
			id: users.id,
			name: users.name
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	return {
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		range: rangeParam,
		metricType,
		userFilter,
		vendorFilter,
		summary: {
			totalSales,
			totalRetained,
			totalVendorAmount,
			totalHours: Math.round(totalHours * 100) / 100,
			daysWithData,
			employeeCount: uniqueEmployees.size,
			avgSalesPerDay: daysWithData > 0 ? Math.round(totalSales / daysWithData * 100) / 100 : 0,
			avgRetainedPerHour: totalHours > 0 ? Math.round(totalRetained / totalHours * 100) / 100 : 0
		},
		metricsData,
		vendorList,
		usersList
	};
};
