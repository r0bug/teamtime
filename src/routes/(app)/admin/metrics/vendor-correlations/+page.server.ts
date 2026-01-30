import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { sql, gte, lte, and, eq, desc, isNotNull } from 'drizzle-orm';
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
	const employeeFilter = url.searchParams.get('employee') || '';
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
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startDate.toISOString().split('T')[0]),
				lte(salesSnapshots.saleDate, endDate.toISOString().split('T')[0])
			)
		)
		.orderBy(desc(salesSnapshots.saleDate));

	// Get all completed time entries in the date range
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
				isNotNull(timeEntries.clockOut)
			)
		);

	// Group time entries by date and user
	const hoursByDateUser = new Map<string, Map<string, { name: string; hours: number }>>();

	for (const entry of entriesResult) {
		if (!entry.clockIn || !entry.clockOut) continue;

		const dateStr = new Date(entry.clockIn).toISOString().split('T')[0];
		const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);

		if (!hoursByDateUser.has(dateStr)) {
			hoursByDateUser.set(dateStr, new Map());
		}
		const dateMap = hoursByDateUser.get(dateStr)!;

		const existing = dateMap.get(entry.userId);
		if (existing) {
			existing.hours += hours;
		} else {
			dateMap.set(entry.userId, { name: entry.userName, hours });
		}
	}

	// Build correlation data
	interface CorrelationRow {
		date: string;
		periodLabel: string;
		employeeId: string;
		employeeName: string;
		vendorId: string;
		vendorName: string;
		hoursWorked: number;
		vendorSales: number;
		deltaPercent: number;
		attribution: number;
	}

	const correlations: CorrelationRow[] = [];

	// Collect all unique vendors
	const vendorSet = new Map<string, string>();
	for (const snapshot of snapshots) {
		const vendors = snapshot.vendors as VendorSalesData[] || [];
		for (const v of vendors) {
			vendorSet.set(v.vendor_id, v.vendor_name);
		}
	}

	// Process based on period type
	if (periodType === 'daily') {
		for (const snapshot of snapshots) {
			const dateHours = hoursByDateUser.get(snapshot.saleDate);
			if (!dateHours) continue;

			const vendors = snapshot.vendors as VendorSalesData[] || [];
			const totalDayHours = Array.from(dateHours.values()).reduce((sum, e) => sum + e.hours, 0);

			for (const [userId, userData] of dateHours) {
				if (employeeFilter && userId !== employeeFilter) continue;

				const percentOfDay = totalDayHours > 0 ? userData.hours / totalDayHours : 0;

				for (const vendor of vendors) {
					if (vendorFilter && vendor.vendor_id !== vendorFilter) continue;

					const attribution = vendor.total_sales * percentOfDay;
					const avgSalesPerHour = userData.hours > 0 ? attribution / userData.hours : 0;
					const overallAvg = totalDayHours > 0 ? vendor.total_sales / totalDayHours : 0;
					const deltaPercent = overallAvg > 0 ? ((avgSalesPerHour - overallAvg) / overallAvg) * 100 : 0;

					correlations.push({
						date: snapshot.saleDate,
						periodLabel: formatDate(snapshot.saleDate),
						employeeId: userId,
						employeeName: userData.name,
						vendorId: vendor.vendor_id,
						vendorName: vendor.vendor_name,
						hoursWorked: Math.round(userData.hours * 100) / 100,
						vendorSales: Math.round(vendor.total_sales * 100) / 100,
						deltaPercent: Math.round(deltaPercent * 10) / 10,
						attribution: Math.round(attribution * 100) / 100
					});
				}
			}
		}
	} else if (periodType === 'weekly') {
		// Group by week
		const weeklyData = new Map<string, {
			vendors: Map<string, { name: string; totalSales: number }>;
			employees: Map<string, { name: string; totalHours: number }>;
			totalHours: number;
		}>();

		for (const snapshot of snapshots) {
			const date = new Date(snapshot.saleDate + 'T00:00:00');
			const weekStart = new Date(date);
			weekStart.setDate(date.getDate() - date.getDay());
			const weekKey = weekStart.toISOString().split('T')[0];

			if (!weeklyData.has(weekKey)) {
				weeklyData.set(weekKey, { vendors: new Map(), employees: new Map(), totalHours: 0 });
			}
			const weekData = weeklyData.get(weekKey)!;

			const vendors = snapshot.vendors as VendorSalesData[] || [];
			for (const v of vendors) {
				const existing = weekData.vendors.get(v.vendor_id);
				if (existing) {
					existing.totalSales += v.total_sales;
				} else {
					weekData.vendors.set(v.vendor_id, { name: v.vendor_name, totalSales: v.total_sales });
				}
			}

			const dateHours = hoursByDateUser.get(snapshot.saleDate);
			if (dateHours) {
				for (const [userId, userData] of dateHours) {
					const existing = weekData.employees.get(userId);
					if (existing) {
						existing.totalHours += userData.hours;
					} else {
						weekData.employees.set(userId, { name: userData.name, totalHours: userData.hours });
					}
					weekData.totalHours += userData.hours;
				}
			}
		}

		for (const [weekKey, weekData] of weeklyData) {
			for (const [userId, userData] of weekData.employees) {
				if (employeeFilter && userId !== employeeFilter) continue;

				const percentOfWeek = weekData.totalHours > 0 ? userData.totalHours / weekData.totalHours : 0;

				for (const [vendorId, vendorData] of weekData.vendors) {
					if (vendorFilter && vendorId !== vendorFilter) continue;

					const attribution = vendorData.totalSales * percentOfWeek;
					const avgSalesPerHour = userData.totalHours > 0 ? attribution / userData.totalHours : 0;
					const overallAvg = weekData.totalHours > 0 ? vendorData.totalSales / weekData.totalHours : 0;
					const deltaPercent = overallAvg > 0 ? ((avgSalesPerHour - overallAvg) / overallAvg) * 100 : 0;

					correlations.push({
						date: weekKey,
						periodLabel: `Week of ${formatDate(weekKey)}`,
						employeeId: userId,
						employeeName: userData.name,
						vendorId: vendorId,
						vendorName: vendorData.name,
						hoursWorked: Math.round(userData.totalHours * 100) / 100,
						vendorSales: Math.round(vendorData.totalSales * 100) / 100,
						deltaPercent: Math.round(deltaPercent * 10) / 10,
						attribution: Math.round(attribution * 100) / 100
					});
				}
			}
		}
	} else if (periodType === 'monthly') {
		// Group by month
		const monthlyData = new Map<string, {
			vendors: Map<string, { name: string; totalSales: number }>;
			employees: Map<string, { name: string; totalHours: number }>;
			totalHours: number;
		}>();

		for (const snapshot of snapshots) {
			const date = new Date(snapshot.saleDate + 'T00:00:00');
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

			if (!monthlyData.has(monthKey)) {
				monthlyData.set(monthKey, { vendors: new Map(), employees: new Map(), totalHours: 0 });
			}
			const monthData = monthlyData.get(monthKey)!;

			const vendors = snapshot.vendors as VendorSalesData[] || [];
			for (const v of vendors) {
				const existing = monthData.vendors.get(v.vendor_id);
				if (existing) {
					existing.totalSales += v.total_sales;
				} else {
					monthData.vendors.set(v.vendor_id, { name: v.vendor_name, totalSales: v.total_sales });
				}
			}

			const dateHours = hoursByDateUser.get(snapshot.saleDate);
			if (dateHours) {
				for (const [userId, userData] of dateHours) {
					const existing = monthData.employees.get(userId);
					if (existing) {
						existing.totalHours += userData.hours;
					} else {
						monthData.employees.set(userId, { name: userData.name, totalHours: userData.hours });
					}
					monthData.totalHours += userData.hours;
				}
			}
		}

		for (const [monthKey, monthData] of monthlyData) {
			for (const [userId, userData] of monthData.employees) {
				if (employeeFilter && userId !== employeeFilter) continue;

				const percentOfMonth = monthData.totalHours > 0 ? userData.totalHours / monthData.totalHours : 0;

				for (const [vendorId, vendorData] of monthData.vendors) {
					if (vendorFilter && vendorId !== vendorFilter) continue;

					const attribution = vendorData.totalSales * percentOfMonth;
					const avgSalesPerHour = userData.totalHours > 0 ? attribution / userData.totalHours : 0;
					const overallAvg = monthData.totalHours > 0 ? vendorData.totalSales / monthData.totalHours : 0;
					const deltaPercent = overallAvg > 0 ? ((avgSalesPerHour - overallAvg) / overallAvg) * 100 : 0;

					correlations.push({
						date: monthKey,
						periodLabel: formatMonthYear(monthKey),
						employeeId: userId,
						employeeName: userData.name,
						vendorId: vendorId,
						vendorName: vendorData.name,
						hoursWorked: Math.round(userData.totalHours * 100) / 100,
						vendorSales: Math.round(vendorData.totalSales * 100) / 100,
						deltaPercent: Math.round(deltaPercent * 10) / 10,
						attribution: Math.round(attribution * 100) / 100
					});
				}
			}
		}
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

	return {
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		periodType,
		employeeFilter,
		vendorFilter,
		correlations,
		employeeList,
		vendorList
	};
};

function formatDate(dateStr: string): string {
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

function formatMonthYear(dateStr: string): string {
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric'
	});
}
