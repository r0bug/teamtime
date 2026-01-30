/**
 * @module Services/VendorCorrelation
 * @description Analyzes correlations between employee shifts and vendor sales performance.
 *
 * This service computes and tracks how vendor sales perform during different employees'
 * shifts, enabling insights like:
 * - Which employees correlate with higher sales for specific vendors
 * - Vendor performance trends by time period
 * - Statistical confidence in correlation data
 *
 * Correlation Logic:
 * - Joins salesSnapshots with timeEntries to identify who worked when sales occurred
 * - Extracts per-vendor breakdown from salesSnapshots.vendors JSONB field
 * - Compares each employee's shift periods with vendor performance
 * - Calculates delta from overall average vendor sales
 * - Stores confidence score based on sample size
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 * @see {@link ./sales-attribution-service} for related sales attribution logic
 */

import {
	db,
	timeEntries,
	salesSnapshots,
	vendorEmployeeCorrelations,
	users,
	type VendorSalesData
} from '$lib/server/db';
import { eq, and, gte, lt, lte, sql, isNotNull, desc, asc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import {
	getPacificDayBounds,
	getPacificWeekStart,
	toPacificDateString
} from '$lib/server/utils/timezone';

const log = createLogger('server:vendor-correlation-service');

// ============================================================================
// TYPES
// ============================================================================

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface DateRange {
	start: Date;
	end: Date;
}

interface VendorCorrelationData {
	userId: string;
	userName: string;
	vendorId: string;
	vendorName: string;
	periodType: PeriodType;
	periodStart: string;
	shiftsCount: number;
	hoursWorked: number;
	vendorSales: number;
	vendorRetained: number;
	transactionCount: number;
	avgVendorSalesOverall: number;
	salesDeltaPct: number;
	sampleSize: number;
	confidenceScore: number;
}

interface EmployeeShiftData {
	userId: string;
	userName: string;
	clockIn: Date;
	clockOut: Date;
	hoursWorked: number;
}

interface VendorTrend {
	periodStart: string;
	vendorId: string;
	vendorName: string;
	vendorSales: number;
	vendorRetained: number;
	salesDeltaPct: number;
	confidenceScore: number;
}

interface EmployeeTrend {
	periodStart: string;
	userId: string;
	userName: string;
	hoursWorked: number;
	vendorSales: number;
	vendorRetained: number;
	salesDeltaPct: number;
	confidenceScore: number;
}

interface CorrelationMatrixEntry {
	userId: string;
	userName: string;
	vendorId: string;
	vendorName: string;
	totalShifts: number;
	totalHours: number;
	totalVendorSales: number;
	avgSalesPerHour: number;
	salesDeltaPct: number;
	confidenceScore: number;
}

interface TopCorrelationOptions {
	positive?: boolean;
	minShifts?: number;
	minHours?: number;
	periodType?: PeriodType;
	limit?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate confidence score based on sample size
 * Uses a sigmoid-like function that approaches 1.0 as sample size increases
 */
function calculateConfidenceScore(sampleSize: number): number {
	if (sampleSize === 0) return 0;
	// Score approaches 1.0 asymptotically
	// At sample size 10: ~0.67, at 30: ~0.90, at 50: ~0.95
	const score = 1 - Math.exp(-sampleSize / 15);
	return Math.round(score * 10000) / 10000;
}

/**
 * Get employees who worked on a specific date with their shift data
 */
async function getEmployeeShiftsForDate(date: Date): Promise<EmployeeShiftData[]> {
	const { start: dayStart, end: dayEnd } = getPacificDayBounds(date);

	const entries = await db
		.select({
			userId: timeEntries.userId,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.leftJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				gte(timeEntries.clockIn, dayStart),
				lt(timeEntries.clockIn, dayEnd),
				isNotNull(timeEntries.clockOut)
			)
		);

	return entries
		.filter(e => e.clockOut !== null)
		.map(e => {
			const clockIn = new Date(e.clockIn);
			const clockOut = new Date(e.clockOut!);
			const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
			return {
				userId: e.userId,
				userName: e.userName || 'Unknown',
				clockIn,
				clockOut,
				hoursWorked: Math.round(hoursWorked * 100) / 100
			};
		});
}

/**
 * Get sales snapshot for a specific date
 */
async function getSalesSnapshotForDate(dateStr: string) {
	const [snapshot] = await db
		.select()
		.from(salesSnapshots)
		.where(eq(salesSnapshots.saleDate, dateStr))
		.limit(1);

	return snapshot;
}

/**
 * Calculate overall average vendor sales for a date range
 */
async function calculateOverallVendorAverages(
	dateRange: DateRange
): Promise<Map<string, { totalSales: number; count: number }>> {
	const vendorAverages = new Map<string, { totalSales: number; count: number }>();

	const snapshots = await db
		.select({
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, toPacificDateString(dateRange.start)),
				lte(salesSnapshots.saleDate, toPacificDateString(dateRange.end))
			)
		);

	for (const snapshot of snapshots) {
		const vendors = snapshot.vendors as VendorSalesData[];
		for (const vendor of vendors) {
			const existing = vendorAverages.get(vendor.vendor_id);
			if (existing) {
				existing.totalSales += vendor.total_sales;
				existing.count += 1;
			} else {
				vendorAverages.set(vendor.vendor_id, {
					totalSales: vendor.total_sales,
					count: 1
				});
			}
		}
	}

	return vendorAverages;
}

/**
 * Get the start of the week containing the given date
 */
function getWeekStartDate(date: Date): Date {
	return getPacificWeekStart(date);
}

/**
 * Get the start of the month containing the given date
 */
function getMonthStartDate(date: Date): string {
	const dateStr = toPacificDateString(date);
	return dateStr.substring(0, 7) + '-01'; // YYYY-MM-01
}

// ============================================================================
// CORE CORRELATION FUNCTIONS
// ============================================================================

/**
 * Compute vendor-employee correlations for a specific day
 */
export async function computeDailyCorrelations(date: Date): Promise<VendorCorrelationData[]> {
	const dateStr = toPacificDateString(date);
	log.info({ date: dateStr }, 'Computing daily correlations');

	// Get sales snapshot for this date
	const snapshot = await getSalesSnapshotForDate(dateStr);
	if (!snapshot) {
		log.debug({ date: dateStr }, 'No sales snapshot found for date');
		return [];
	}

	// Get employees who worked this day
	const employeeShifts = await getEmployeeShiftsForDate(date);
	if (employeeShifts.length === 0) {
		log.debug({ date: dateStr }, 'No employees worked on this date');
		return [];
	}

	// Aggregate shifts by employee
	const employeeData = new Map<string, { name: string; shifts: number; hours: number }>();
	for (const shift of employeeShifts) {
		const existing = employeeData.get(shift.userId);
		if (existing) {
			existing.shifts += 1;
			existing.hours += shift.hoursWorked;
		} else {
			employeeData.set(shift.userId, {
				name: shift.userName,
				shifts: 1,
				hours: shift.hoursWorked
			});
		}
	}

	// Get overall vendor averages for context (last 30 days)
	const thirtyDaysAgo = new Date(date);
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const vendorAverages = await calculateOverallVendorAverages({
		start: thirtyDaysAgo,
		end: date
	});

	const correlations: VendorCorrelationData[] = [];
	const vendors = snapshot.vendors as VendorSalesData[];

	// For each employee-vendor combination, create correlation record
	for (const [userId, empData] of employeeData) {
		for (const vendor of vendors) {
			const avgData = vendorAverages.get(vendor.vendor_id);
			const avgSales = avgData ? avgData.totalSales / avgData.count : 0;
			const salesDeltaPct = avgSales > 0
				? ((vendor.total_sales - avgSales) / avgSales) * 100
				: 0;

			const correlation: VendorCorrelationData = {
				userId,
				userName: empData.name,
				vendorId: vendor.vendor_id,
				vendorName: vendor.vendor_name,
				periodType: 'daily',
				periodStart: dateStr,
				shiftsCount: empData.shifts,
				hoursWorked: empData.hours,
				vendorSales: vendor.total_sales,
				vendorRetained: vendor.retained_amount,
				transactionCount: 1, // Daily count
				avgVendorSalesOverall: Math.round(avgSales * 100) / 100,
				salesDeltaPct: Math.round(salesDeltaPct * 100) / 100,
				sampleSize: 1,
				confidenceScore: calculateConfidenceScore(1)
			};

			correlations.push(correlation);
		}
	}

	// Upsert correlations to database
	for (const corr of correlations) {
		await db
			.insert(vendorEmployeeCorrelations)
			.values({
				userId: corr.userId,
				vendorId: corr.vendorId,
				vendorName: corr.vendorName,
				periodType: corr.periodType,
				periodStart: corr.periodStart,
				shiftsCount: corr.shiftsCount,
				hoursWorked: String(corr.hoursWorked),
				vendorSales: String(corr.vendorSales),
				vendorRetained: String(corr.vendorRetained),
				transactionCount: corr.transactionCount,
				avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
				salesDeltaPct: String(corr.salesDeltaPct),
				sampleSize: corr.sampleSize,
				confidenceScore: String(corr.confidenceScore)
			})
			.onConflictDoUpdate({
				target: [
					vendorEmployeeCorrelations.userId,
					vendorEmployeeCorrelations.vendorId,
					vendorEmployeeCorrelations.periodType,
					vendorEmployeeCorrelations.periodStart
				],
				set: {
					vendorName: corr.vendorName,
					shiftsCount: corr.shiftsCount,
					hoursWorked: String(corr.hoursWorked),
					vendorSales: String(corr.vendorSales),
					vendorRetained: String(corr.vendorRetained),
					transactionCount: corr.transactionCount,
					avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
					salesDeltaPct: String(corr.salesDeltaPct),
					sampleSize: corr.sampleSize,
					confidenceScore: String(corr.confidenceScore),
					updatedAt: new Date()
				}
			});
	}

	log.info(
		{ date: dateStr, correlationsCount: correlations.length },
		'Daily correlations computed'
	);

	return correlations;
}

/**
 * Compute weekly vendor-employee correlations by aggregating daily data
 */
export async function computeWeeklyCorrelations(weekStart: Date): Promise<VendorCorrelationData[]> {
	const weekStartStr = toPacificDateString(weekStart);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	const weekEndStr = toPacificDateString(weekEnd);

	log.info({ weekStart: weekStartStr, weekEnd: weekEndStr }, 'Computing weekly correlations');

	// Get all daily correlations for this week
	const dailyCorrelations = await db
		.select()
		.from(vendorEmployeeCorrelations)
		.where(
			and(
				eq(vendorEmployeeCorrelations.periodType, 'daily'),
				gte(vendorEmployeeCorrelations.periodStart, weekStartStr),
				lte(vendorEmployeeCorrelations.periodStart, weekEndStr)
			)
		);

	// Aggregate by user-vendor combination
	const aggregated = new Map<string, VendorCorrelationData>();

	for (const daily of dailyCorrelations) {
		const key = `${daily.userId}-${daily.vendorId}`;
		const existing = aggregated.get(key);

		if (existing) {
			existing.shiftsCount += daily.shiftsCount;
			existing.hoursWorked += parseFloat(daily.hoursWorked);
			existing.vendorSales += parseFloat(daily.vendorSales);
			existing.vendorRetained += parseFloat(daily.vendorRetained);
			existing.transactionCount += daily.transactionCount;
			existing.sampleSize += 1;
		} else {
			// Need to get user name
			const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, daily.userId)).limit(1);

			aggregated.set(key, {
				userId: daily.userId,
				userName: user?.name || 'Unknown',
				vendorId: daily.vendorId,
				vendorName: daily.vendorName,
				periodType: 'weekly',
				periodStart: weekStartStr,
				shiftsCount: daily.shiftsCount,
				hoursWorked: parseFloat(daily.hoursWorked),
				vendorSales: parseFloat(daily.vendorSales),
				vendorRetained: parseFloat(daily.vendorRetained),
				transactionCount: daily.transactionCount,
				avgVendorSalesOverall: 0,
				salesDeltaPct: 0,
				sampleSize: 1,
				confidenceScore: 0
			});
		}
	}

	// Calculate overall averages for the week
	const vendorAverages = await calculateOverallVendorAverages({
		start: weekStart,
		end: weekEnd
	});

	// Update delta percentages and confidence scores
	const correlations: VendorCorrelationData[] = [];
	for (const [, corr] of aggregated) {
		const avgData = vendorAverages.get(corr.vendorId);
		const avgSales = avgData ? avgData.totalSales / avgData.count : 0;
		const avgDailySales = corr.vendorSales / Math.max(corr.sampleSize, 1);
		const salesDeltaPct = avgSales > 0
			? ((avgDailySales - avgSales) / avgSales) * 100
			: 0;

		corr.avgVendorSalesOverall = Math.round(avgSales * 100) / 100;
		corr.salesDeltaPct = Math.round(salesDeltaPct * 100) / 100;
		corr.confidenceScore = calculateConfidenceScore(corr.sampleSize);
		corr.hoursWorked = Math.round(corr.hoursWorked * 100) / 100;
		corr.vendorSales = Math.round(corr.vendorSales * 100) / 100;
		corr.vendorRetained = Math.round(corr.vendorRetained * 100) / 100;

		correlations.push(corr);
	}

	// Upsert weekly correlations
	for (const corr of correlations) {
		await db
			.insert(vendorEmployeeCorrelations)
			.values({
				userId: corr.userId,
				vendorId: corr.vendorId,
				vendorName: corr.vendorName,
				periodType: corr.periodType,
				periodStart: corr.periodStart,
				shiftsCount: corr.shiftsCount,
				hoursWorked: String(corr.hoursWorked),
				vendorSales: String(corr.vendorSales),
				vendorRetained: String(corr.vendorRetained),
				transactionCount: corr.transactionCount,
				avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
				salesDeltaPct: String(corr.salesDeltaPct),
				sampleSize: corr.sampleSize,
				confidenceScore: String(corr.confidenceScore)
			})
			.onConflictDoUpdate({
				target: [
					vendorEmployeeCorrelations.userId,
					vendorEmployeeCorrelations.vendorId,
					vendorEmployeeCorrelations.periodType,
					vendorEmployeeCorrelations.periodStart
				],
				set: {
					vendorName: corr.vendorName,
					shiftsCount: corr.shiftsCount,
					hoursWorked: String(corr.hoursWorked),
					vendorSales: String(corr.vendorSales),
					vendorRetained: String(corr.vendorRetained),
					transactionCount: corr.transactionCount,
					avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
					salesDeltaPct: String(corr.salesDeltaPct),
					sampleSize: corr.sampleSize,
					confidenceScore: String(corr.confidenceScore),
					updatedAt: new Date()
				}
			});
	}

	log.info(
		{ weekStart: weekStartStr, correlationsCount: correlations.length },
		'Weekly correlations computed'
	);

	return correlations;
}

/**
 * Compute monthly vendor-employee correlations by aggregating weekly data
 */
export async function computeMonthlyCorrelations(monthStart: Date): Promise<VendorCorrelationData[]> {
	const monthStartStr = getMonthStartDate(monthStart);
	const monthEnd = new Date(monthStart);
	monthEnd.setMonth(monthEnd.getMonth() + 1);
	monthEnd.setDate(0); // Last day of the month
	const monthEndStr = toPacificDateString(monthEnd);

	log.info({ monthStart: monthStartStr, monthEnd: monthEndStr }, 'Computing monthly correlations');

	// Get all weekly correlations for this month
	const weeklyCorrelations = await db
		.select()
		.from(vendorEmployeeCorrelations)
		.where(
			and(
				eq(vendorEmployeeCorrelations.periodType, 'weekly'),
				gte(vendorEmployeeCorrelations.periodStart, monthStartStr),
				lte(vendorEmployeeCorrelations.periodStart, monthEndStr)
			)
		);

	// Aggregate by user-vendor combination
	const aggregated = new Map<string, VendorCorrelationData>();

	for (const weekly of weeklyCorrelations) {
		const key = `${weekly.userId}-${weekly.vendorId}`;
		const existing = aggregated.get(key);

		if (existing) {
			existing.shiftsCount += weekly.shiftsCount;
			existing.hoursWorked += parseFloat(weekly.hoursWorked);
			existing.vendorSales += parseFloat(weekly.vendorSales);
			existing.vendorRetained += parseFloat(weekly.vendorRetained);
			existing.transactionCount += weekly.transactionCount;
			existing.sampleSize += weekly.sampleSize;
		} else {
			const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, weekly.userId)).limit(1);

			aggregated.set(key, {
				userId: weekly.userId,
				userName: user?.name || 'Unknown',
				vendorId: weekly.vendorId,
				vendorName: weekly.vendorName,
				periodType: 'monthly',
				periodStart: monthStartStr,
				shiftsCount: weekly.shiftsCount,
				hoursWorked: parseFloat(weekly.hoursWorked),
				vendorSales: parseFloat(weekly.vendorSales),
				vendorRetained: parseFloat(weekly.vendorRetained),
				transactionCount: weekly.transactionCount,
				avgVendorSalesOverall: 0,
				salesDeltaPct: 0,
				sampleSize: weekly.sampleSize,
				confidenceScore: 0
			});
		}
	}

	// Calculate overall averages for the month
	const vendorAverages = await calculateOverallVendorAverages({
		start: new Date(monthStartStr),
		end: monthEnd
	});

	// Update delta percentages and confidence scores
	const correlations: VendorCorrelationData[] = [];
	for (const [, corr] of aggregated) {
		const avgData = vendorAverages.get(corr.vendorId);
		const avgSales = avgData ? avgData.totalSales / avgData.count : 0;
		const avgDailySales = corr.vendorSales / Math.max(corr.sampleSize, 1);
		const salesDeltaPct = avgSales > 0
			? ((avgDailySales - avgSales) / avgSales) * 100
			: 0;

		corr.avgVendorSalesOverall = Math.round(avgSales * 100) / 100;
		corr.salesDeltaPct = Math.round(salesDeltaPct * 100) / 100;
		corr.confidenceScore = calculateConfidenceScore(corr.sampleSize);
		corr.hoursWorked = Math.round(corr.hoursWorked * 100) / 100;
		corr.vendorSales = Math.round(corr.vendorSales * 100) / 100;
		corr.vendorRetained = Math.round(corr.vendorRetained * 100) / 100;

		correlations.push(corr);
	}

	// Upsert monthly correlations
	for (const corr of correlations) {
		await db
			.insert(vendorEmployeeCorrelations)
			.values({
				userId: corr.userId,
				vendorId: corr.vendorId,
				vendorName: corr.vendorName,
				periodType: corr.periodType,
				periodStart: corr.periodStart,
				shiftsCount: corr.shiftsCount,
				hoursWorked: String(corr.hoursWorked),
				vendorSales: String(corr.vendorSales),
				vendorRetained: String(corr.vendorRetained),
				transactionCount: corr.transactionCount,
				avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
				salesDeltaPct: String(corr.salesDeltaPct),
				sampleSize: corr.sampleSize,
				confidenceScore: String(corr.confidenceScore)
			})
			.onConflictDoUpdate({
				target: [
					vendorEmployeeCorrelations.userId,
					vendorEmployeeCorrelations.vendorId,
					vendorEmployeeCorrelations.periodType,
					vendorEmployeeCorrelations.periodStart
				],
				set: {
					vendorName: corr.vendorName,
					shiftsCount: corr.shiftsCount,
					hoursWorked: String(corr.hoursWorked),
					vendorSales: String(corr.vendorSales),
					vendorRetained: String(corr.vendorRetained),
					transactionCount: corr.transactionCount,
					avgVendorSalesOverall: String(corr.avgVendorSalesOverall),
					salesDeltaPct: String(corr.salesDeltaPct),
					sampleSize: corr.sampleSize,
					confidenceScore: String(corr.confidenceScore),
					updatedAt: new Date()
				}
			});
	}

	log.info(
		{ monthStart: monthStartStr, correlationsCount: correlations.length },
		'Monthly correlations computed'
	);

	return correlations;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get vendor trends for a specific employee over a date range
 */
export async function getVendorTrendsByEmployee(
	userId: string,
	dateRange: DateRange,
	periodType?: PeriodType
): Promise<VendorTrend[]> {
	const startStr = toPacificDateString(dateRange.start);
	const endStr = toPacificDateString(dateRange.end);

	log.debug({ userId, startStr, endStr, periodType }, 'Getting vendor trends for employee');

	const conditions = [
		eq(vendorEmployeeCorrelations.userId, userId),
		gte(vendorEmployeeCorrelations.periodStart, startStr),
		lte(vendorEmployeeCorrelations.periodStart, endStr)
	];

	if (periodType) {
		conditions.push(eq(vendorEmployeeCorrelations.periodType, periodType));
	}

	const correlations = await db
		.select()
		.from(vendorEmployeeCorrelations)
		.where(and(...conditions))
		.orderBy(asc(vendorEmployeeCorrelations.periodStart), asc(vendorEmployeeCorrelations.vendorName));

	return correlations.map(c => ({
		periodStart: c.periodStart,
		vendorId: c.vendorId,
		vendorName: c.vendorName,
		vendorSales: parseFloat(c.vendorSales),
		vendorRetained: parseFloat(c.vendorRetained),
		salesDeltaPct: parseFloat(c.salesDeltaPct),
		confidenceScore: parseFloat(c.confidenceScore)
	}));
}

/**
 * Get employee trends for a specific vendor over a date range
 */
export async function getEmployeeTrendsByVendor(
	vendorId: string,
	dateRange: DateRange,
	periodType?: PeriodType
): Promise<EmployeeTrend[]> {
	const startStr = toPacificDateString(dateRange.start);
	const endStr = toPacificDateString(dateRange.end);

	log.debug({ vendorId, startStr, endStr, periodType }, 'Getting employee trends for vendor');

	const conditions = [
		eq(vendorEmployeeCorrelations.vendorId, vendorId),
		gte(vendorEmployeeCorrelations.periodStart, startStr),
		lte(vendorEmployeeCorrelations.periodStart, endStr)
	];

	if (periodType) {
		conditions.push(eq(vendorEmployeeCorrelations.periodType, periodType));
	}

	const correlations = await db
		.select({
			periodStart: vendorEmployeeCorrelations.periodStart,
			userId: vendorEmployeeCorrelations.userId,
			userName: users.name,
			hoursWorked: vendorEmployeeCorrelations.hoursWorked,
			vendorSales: vendorEmployeeCorrelations.vendorSales,
			vendorRetained: vendorEmployeeCorrelations.vendorRetained,
			salesDeltaPct: vendorEmployeeCorrelations.salesDeltaPct,
			confidenceScore: vendorEmployeeCorrelations.confidenceScore
		})
		.from(vendorEmployeeCorrelations)
		.leftJoin(users, eq(vendorEmployeeCorrelations.userId, users.id))
		.where(and(...conditions))
		.orderBy(asc(vendorEmployeeCorrelations.periodStart), asc(users.name));

	return correlations.map(c => ({
		periodStart: c.periodStart,
		userId: c.userId,
		userName: c.userName || 'Unknown',
		hoursWorked: parseFloat(c.hoursWorked),
		vendorSales: parseFloat(c.vendorSales),
		vendorRetained: parseFloat(c.vendorRetained),
		salesDeltaPct: parseFloat(c.salesDeltaPct),
		confidenceScore: parseFloat(c.confidenceScore)
	}));
}

/**
 * Get top correlations (positive or negative) with optional filters
 */
export async function getTopCorrelations(
	options: TopCorrelationOptions = {}
): Promise<VendorCorrelationData[]> {
	const {
		positive = true,
		minShifts = 1,
		minHours = 0,
		periodType,
		limit = 10
	} = options;

	log.debug({ options }, 'Getting top correlations');

	const conditions = [
		gte(vendorEmployeeCorrelations.shiftsCount, minShifts),
		gte(sql`CAST(${vendorEmployeeCorrelations.hoursWorked} AS DECIMAL)`, minHours)
	];

	if (periodType) {
		conditions.push(eq(vendorEmployeeCorrelations.periodType, periodType));
	}

	// Filter for positive or negative correlations
	if (positive) {
		conditions.push(gte(sql`CAST(${vendorEmployeeCorrelations.salesDeltaPct} AS DECIMAL)`, 0));
	} else {
		conditions.push(lt(sql`CAST(${vendorEmployeeCorrelations.salesDeltaPct} AS DECIMAL)`, 0));
	}

	const correlations = await db
		.select({
			userId: vendorEmployeeCorrelations.userId,
			userName: users.name,
			vendorId: vendorEmployeeCorrelations.vendorId,
			vendorName: vendorEmployeeCorrelations.vendorName,
			periodType: vendorEmployeeCorrelations.periodType,
			periodStart: vendorEmployeeCorrelations.periodStart,
			shiftsCount: vendorEmployeeCorrelations.shiftsCount,
			hoursWorked: vendorEmployeeCorrelations.hoursWorked,
			vendorSales: vendorEmployeeCorrelations.vendorSales,
			vendorRetained: vendorEmployeeCorrelations.vendorRetained,
			transactionCount: vendorEmployeeCorrelations.transactionCount,
			avgVendorSalesOverall: vendorEmployeeCorrelations.avgVendorSalesOverall,
			salesDeltaPct: vendorEmployeeCorrelations.salesDeltaPct,
			sampleSize: vendorEmployeeCorrelations.sampleSize,
			confidenceScore: vendorEmployeeCorrelations.confidenceScore
		})
		.from(vendorEmployeeCorrelations)
		.leftJoin(users, eq(vendorEmployeeCorrelations.userId, users.id))
		.where(and(...conditions))
		.orderBy(
			positive
				? desc(sql`CAST(${vendorEmployeeCorrelations.salesDeltaPct} AS DECIMAL)`)
				: asc(sql`CAST(${vendorEmployeeCorrelations.salesDeltaPct} AS DECIMAL)`)
		)
		.limit(limit);

	return correlations.map(c => ({
		userId: c.userId,
		userName: c.userName || 'Unknown',
		vendorId: c.vendorId,
		vendorName: c.vendorName,
		periodType: c.periodType as PeriodType,
		periodStart: c.periodStart,
		shiftsCount: c.shiftsCount,
		hoursWorked: parseFloat(c.hoursWorked),
		vendorSales: parseFloat(c.vendorSales),
		vendorRetained: parseFloat(c.vendorRetained),
		transactionCount: c.transactionCount,
		avgVendorSalesOverall: parseFloat(c.avgVendorSalesOverall),
		salesDeltaPct: parseFloat(c.salesDeltaPct),
		sampleSize: c.sampleSize,
		confidenceScore: parseFloat(c.confidenceScore)
	}));
}

/**
 * Get correlation matrix showing employee vs vendor performance
 */
export async function getCorrelationMatrix(
	dateRange: DateRange,
	periodType: PeriodType
): Promise<CorrelationMatrixEntry[]> {
	const startStr = toPacificDateString(dateRange.start);
	const endStr = toPacificDateString(dateRange.end);

	log.debug({ startStr, endStr, periodType }, 'Getting correlation matrix');

	// Aggregate all correlations for the date range by user-vendor
	const correlations = await db
		.select({
			userId: vendorEmployeeCorrelations.userId,
			userName: users.name,
			vendorId: vendorEmployeeCorrelations.vendorId,
			vendorName: vendorEmployeeCorrelations.vendorName,
			totalShifts: sql<number>`SUM(${vendorEmployeeCorrelations.shiftsCount})::int`,
			totalHours: sql<number>`SUM(CAST(${vendorEmployeeCorrelations.hoursWorked} AS DECIMAL))`,
			totalVendorSales: sql<number>`SUM(CAST(${vendorEmployeeCorrelations.vendorSales} AS DECIMAL))`,
			avgDeltaPct: sql<number>`AVG(CAST(${vendorEmployeeCorrelations.salesDeltaPct} AS DECIMAL))`,
			avgConfidence: sql<number>`AVG(CAST(${vendorEmployeeCorrelations.confidenceScore} AS DECIMAL))`
		})
		.from(vendorEmployeeCorrelations)
		.leftJoin(users, eq(vendorEmployeeCorrelations.userId, users.id))
		.where(
			and(
				eq(vendorEmployeeCorrelations.periodType, periodType),
				gte(vendorEmployeeCorrelations.periodStart, startStr),
				lte(vendorEmployeeCorrelations.periodStart, endStr)
			)
		)
		.groupBy(
			vendorEmployeeCorrelations.userId,
			users.name,
			vendorEmployeeCorrelations.vendorId,
			vendorEmployeeCorrelations.vendorName
		)
		.orderBy(users.name, vendorEmployeeCorrelations.vendorName);

	return correlations.map(c => ({
		userId: c.userId,
		userName: c.userName || 'Unknown',
		vendorId: c.vendorId,
		vendorName: c.vendorName,
		totalShifts: c.totalShifts,
		totalHours: Math.round(c.totalHours * 100) / 100,
		totalVendorSales: Math.round(c.totalVendorSales * 100) / 100,
		avgSalesPerHour: c.totalHours > 0
			? Math.round((c.totalVendorSales / c.totalHours) * 100) / 100
			: 0,
		salesDeltaPct: Math.round(c.avgDeltaPct * 100) / 100,
		confidenceScore: Math.round(c.avgConfidence * 10000) / 10000
	}));
}

/**
 * Generic query for correlations with flexible filtering.
 */
export async function queryCorrelations(params: {
	userId?: string;
	vendorId?: string;
	periodType?: PeriodType;
	dateRange?: { start?: Date; end?: Date };
	limit?: number;
}): Promise<{
	correlations: VendorCorrelationData[];
	count: number;
}> {
	const { userId, vendorId, periodType, dateRange, limit = 100 } = params;

	log.debug({ userId, vendorId, periodType, dateRange, limit }, 'Querying correlations');

	const conditions: ReturnType<typeof eq>[] = [];

	if (userId) {
		conditions.push(eq(vendorEmployeeCorrelations.userId, userId));
	}

	if (vendorId) {
		conditions.push(eq(vendorEmployeeCorrelations.vendorId, vendorId));
	}

	if (periodType) {
		conditions.push(eq(vendorEmployeeCorrelations.periodType, periodType));
	}

	if (dateRange?.start) {
		const startStr = toPacificDateString(dateRange.start);
		conditions.push(gte(vendorEmployeeCorrelations.periodStart, startStr));
	}

	if (dateRange?.end) {
		const endStr = toPacificDateString(dateRange.end);
		conditions.push(lte(vendorEmployeeCorrelations.periodStart, endStr));
	}

	let query = db
		.select({
			id: vendorEmployeeCorrelations.id,
			userId: vendorEmployeeCorrelations.userId,
			userName: users.name,
			vendorId: vendorEmployeeCorrelations.vendorId,
			vendorName: vendorEmployeeCorrelations.vendorName,
			periodType: vendorEmployeeCorrelations.periodType,
			periodStart: vendorEmployeeCorrelations.periodStart,
			shiftsCount: vendorEmployeeCorrelations.shiftsCount,
			hoursWorked: vendorEmployeeCorrelations.hoursWorked,
			vendorSales: vendorEmployeeCorrelations.vendorSales,
			vendorRetained: vendorEmployeeCorrelations.vendorRetained,
			avgVendorSalesOverall: vendorEmployeeCorrelations.avgVendorSalesOverall,
			salesDeltaPct: vendorEmployeeCorrelations.salesDeltaPct,
			confidenceScore: vendorEmployeeCorrelations.confidenceScore
		})
		.from(vendorEmployeeCorrelations)
		.leftJoin(users, eq(vendorEmployeeCorrelations.userId, users.id));

	if (conditions.length > 0) {
		query = query.where(and(...conditions)) as typeof query;
	}

	const results = await query
		.orderBy(sql`${vendorEmployeeCorrelations.periodStart} DESC`)
		.limit(limit);

	const correlations: VendorCorrelationData[] = results.map(r => ({
		userId: r.userId,
		userName: r.userName || 'Unknown',
		vendorId: r.vendorId,
		vendorName: r.vendorName,
		periodType: r.periodType,
		periodStart: r.periodStart,
		shiftsCount: r.shiftsCount,
		hoursWorked: parseFloat(r.hoursWorked as unknown as string),
		vendorSales: parseFloat(r.vendorSales as unknown as string),
		vendorRetained: parseFloat(r.vendorRetained as unknown as string),
		avgVendorSalesOverall: r.avgVendorSalesOverall ? parseFloat(r.avgVendorSalesOverall as unknown as string) : 0,
		salesDeltaPct: r.salesDeltaPct ? parseFloat(r.salesDeltaPct as unknown as string) : 0,
		confidenceScore: r.confidenceScore ? parseFloat(r.confidenceScore as unknown as string) : 0
	}));

	return {
		correlations,
		count: correlations.length
	};
}
