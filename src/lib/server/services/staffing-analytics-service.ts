/**
 * @module Services/StaffingAnalytics
 * @description Analyzes staffing patterns to find optimal team combinations and efficiency.
 *
 * This service computes and tracks:
 * - Worker pairs: Which employees perform best together
 * - Worker impact: Sales when worker present vs absent
 * - Worker efficiency: $/hour attributed to each worker
 * - Staffing levels: Optimal number of workers per day
 * - Day of week patterns: Best/worst days for sales
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 * @see {@link ./vendor-correlation-service} for related correlation logic
 */

import {
	db,
	timeEntries,
	salesSnapshots,
	users,
	workerPairPerformance,
	workerImpactMetrics,
	staffingLevelMetrics,
	dayOfWeekMetrics,
	type VendorSalesData
} from '$lib/server/db';
import { eq, and, gte, lte, sql, isNotNull, desc, asc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import {
	getPacificDayBounds,
	toPacificDateString
} from '$lib/server/utils/timezone';

const log = createLogger('server:staffing-analytics-service');

// ============================================================================
// TYPES
// ============================================================================

interface DateRange {
	start: Date;
	end: Date;
}

interface DailySalesData {
	date: string;
	totalSales: number;
	totalRetained: number;
	workersPresent: Set<string>;
	totalHours: number;
	hoursByWorker: Map<string, number>;
}

interface WorkerPairData {
	userId1: string;
	userName1: string;
	userId2: string;
	userName2: string;
	daysTogether: number;
	totalSales: number;
	avgDailySales: number;
}

interface WorkerImpactData {
	userId: string;
	userName: string;
	totalHoursWorked: number;
	totalAttributedSales: number;
	salesPerHour: number;
	daysWorked: number;
	avgSalesWhenPresent: number;
	avgSalesWhenAbsent: number;
	salesImpact: number;
	impactConfidence: number;
}

interface StaffingLevelData {
	workerCount: number;
	daysObserved: number;
	avgTotalHours: number;
	avgDailySales: number;
	minDailySales: number;
	maxDailySales: number;
}

interface DayOfWeekData {
	dayOfWeek: number;
	dayName: string;
	daysObserved: number;
	avgWorkerCount: number;
	avgTotalHours: number;
	avgDailySales: number;
	avgRetained: number;
}

interface StaffingInsight {
	type: 'pair' | 'efficiency' | 'impact' | 'staffing' | 'dayOfWeek';
	priority: 'high' | 'medium' | 'low';
	message: string;
	data?: Record<string, unknown>;
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
 * Get day name from day of week number
 */
function getDayName(dayOfWeek: number): string {
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	return days[dayOfWeek] || 'Unknown';
}

/**
 * Get daily sales and staffing data for a date range
 */
async function getDailySalesAndStaffing(dateRange: DateRange): Promise<DailySalesData[]> {
	const startStr = toPacificDateString(dateRange.start);
	const endStr = toPacificDateString(dateRange.end);

	// Get sales snapshots
	const snapshots = await db
		.select({
			saleDate: salesSnapshots.saleDate,
			totalSales: salesSnapshots.totalSales,
			totalRetained: salesSnapshots.totalRetained
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startStr),
				lte(salesSnapshots.saleDate, endStr)
			)
		);

	// Get time entries
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
				gte(timeEntries.clockIn, dateRange.start),
				lte(timeEntries.clockIn, dateRange.end),
				isNotNull(timeEntries.clockOut)
			)
		);

	// Map data by date
	const dataByDate = new Map<string, DailySalesData>();

	// Initialize with sales data
	for (const snapshot of snapshots) {
		dataByDate.set(snapshot.saleDate, {
			date: snapshot.saleDate,
			totalSales: parseFloat(snapshot.totalSales || '0'),
			totalRetained: parseFloat(snapshot.totalRetained || '0'),
			workersPresent: new Set(),
			totalHours: 0,
			hoursByWorker: new Map()
		});
	}

	// Add time entry data
	for (const entry of entries) {
		if (!entry.clockIn || !entry.clockOut) continue;

		const dateStr = toPacificDateString(entry.clockIn);
		const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);

		let dayData = dataByDate.get(dateStr);
		if (!dayData) {
			// Day with work but no sales data
			dayData = {
				date: dateStr,
				totalSales: 0,
				totalRetained: 0,
				workersPresent: new Set(),
				totalHours: 0,
				hoursByWorker: new Map()
			};
			dataByDate.set(dateStr, dayData);
		}

		dayData.workersPresent.add(entry.userId);
		dayData.totalHours += hours;
		dayData.hoursByWorker.set(
			entry.userId,
			(dayData.hoursByWorker.get(entry.userId) || 0) + hours
		);
	}

	return Array.from(dataByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get all user names by ID
 */
async function getUserNames(): Promise<Map<string, string>> {
	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users);

	const nameMap = new Map<string, string>();
	for (const user of allUsers) {
		nameMap.set(user.id, user.name || 'Unknown');
	}
	return nameMap;
}

// ============================================================================
// COMPUTE FUNCTIONS
// ============================================================================

/**
 * Compute worker pair performance data
 */
export async function computeWorkerPairs(startDate: Date, endDate: Date): Promise<{
	pairsComputed: number;
	periodStart: string;
	periodEnd: string;
}> {
	const startStr = toPacificDateString(startDate);
	const endStr = toPacificDateString(endDate);

	log.info({ startDate: startStr, endDate: endStr }, 'Computing worker pairs');

	const dailyData = await getDailySalesAndStaffing({ start: startDate, end: endDate });
	const userNames = await getUserNames();

	// Track pair performance
	const pairStats = new Map<string, {
		userId1: string;
		userId2: string;
		daysTogether: number;
		totalSales: number;
	}>();

	for (const day of dailyData) {
		const workers = Array.from(day.workersPresent).sort();

		// Generate all 2-combinations
		for (let i = 0; i < workers.length; i++) {
			for (let j = i + 1; j < workers.length; j++) {
				const key = `${workers[i]}:${workers[j]}`;
				const existing = pairStats.get(key) || {
					userId1: workers[i],
					userId2: workers[j],
					daysTogether: 0,
					totalSales: 0
				};
				existing.daysTogether += 1;
				existing.totalSales += day.totalSales;
				pairStats.set(key, existing);
			}
		}
	}

	// Upsert pair data
	let pairsComputed = 0;
	for (const [, stats] of pairStats) {
		if (stats.daysTogether < 2) continue; // Need at least 2 days for meaningful data

		const avgDailySales = stats.totalSales / stats.daysTogether;

		await db
			.insert(workerPairPerformance)
			.values({
				periodStart: startStr,
				periodEnd: endStr,
				userId1: stats.userId1,
				userId2: stats.userId2,
				daysTogether: stats.daysTogether,
				totalSales: String(Math.round(stats.totalSales * 100) / 100),
				avgDailySales: String(Math.round(avgDailySales * 100) / 100)
			})
			.onConflictDoUpdate({
				target: [
					workerPairPerformance.userId1,
					workerPairPerformance.userId2,
					workerPairPerformance.periodStart,
					workerPairPerformance.periodEnd
				],
				set: {
					daysTogether: stats.daysTogether,
					totalSales: String(Math.round(stats.totalSales * 100) / 100),
					avgDailySales: String(Math.round(avgDailySales * 100) / 100),
					computedAt: new Date(),
					updatedAt: new Date()
				}
			});
		pairsComputed++;
	}

	log.info({ pairsComputed, periodStart: startStr, periodEnd: endStr }, 'Worker pairs computed');

	return { pairsComputed, periodStart: startStr, periodEnd: endStr };
}

/**
 * Compute worker impact metrics
 */
export async function computeWorkerImpact(startDate: Date, endDate: Date): Promise<{
	workersAnalyzed: number;
	periodStart: string;
	periodEnd: string;
}> {
	const startStr = toPacificDateString(startDate);
	const endStr = toPacificDateString(endDate);

	log.info({ startDate: startStr, endDate: endStr }, 'Computing worker impact');

	const dailyData = await getDailySalesAndStaffing({ start: startDate, end: endDate });
	const userNames = await getUserNames();

	// Get all unique workers
	const allWorkers = new Set<string>();
	for (const day of dailyData) {
		for (const worker of day.workersPresent) {
			allWorkers.add(worker);
		}
	}

	// Calculate impact for each worker
	let workersAnalyzed = 0;
	for (const userId of allWorkers) {
		let daysWorked = 0;
		let totalHoursWorked = 0;
		let totalSalesWhenPresent = 0;
		let totalSalesWhenAbsent = 0;
		let daysAbsent = 0;

		for (const day of dailyData) {
			if (day.workersPresent.has(userId)) {
				daysWorked++;
				totalHoursWorked += day.hoursByWorker.get(userId) || 0;
				totalSalesWhenPresent += day.totalSales;
			} else if (day.workersPresent.size > 0) {
				// Only count days with some workers as "absent" days
				daysAbsent++;
				totalSalesWhenAbsent += day.totalSales;
			}
		}

		if (daysWorked < 2) continue; // Need at least 2 days for meaningful data

		const avgSalesWhenPresent = daysWorked > 0 ? totalSalesWhenPresent / daysWorked : 0;
		const avgSalesWhenAbsent = daysAbsent > 0 ? totalSalesWhenAbsent / daysAbsent : 0;
		const salesImpact = avgSalesWhenPresent - avgSalesWhenAbsent;
		const salesPerHour = totalHoursWorked > 0 ? totalSalesWhenPresent / totalHoursWorked : 0;
		const impactConfidence = calculateConfidenceScore(Math.min(daysWorked, daysAbsent));

		await db
			.insert(workerImpactMetrics)
			.values({
				periodStart: startStr,
				periodEnd: endStr,
				userId,
				totalHoursWorked: String(Math.round(totalHoursWorked * 100) / 100),
				totalAttributedSales: String(Math.round(totalSalesWhenPresent * 100) / 100),
				salesPerHour: String(Math.round(salesPerHour * 100) / 100),
				daysWorked,
				avgSalesWhenPresent: String(Math.round(avgSalesWhenPresent * 100) / 100),
				avgSalesWhenAbsent: String(Math.round(avgSalesWhenAbsent * 100) / 100),
				salesImpact: String(Math.round(salesImpact * 100) / 100),
				impactConfidence: String(impactConfidence)
			})
			.onConflictDoUpdate({
				target: [
					workerImpactMetrics.userId,
					workerImpactMetrics.periodStart,
					workerImpactMetrics.periodEnd
				],
				set: {
					totalHoursWorked: String(Math.round(totalHoursWorked * 100) / 100),
					totalAttributedSales: String(Math.round(totalSalesWhenPresent * 100) / 100),
					salesPerHour: String(Math.round(salesPerHour * 100) / 100),
					daysWorked,
					avgSalesWhenPresent: String(Math.round(avgSalesWhenPresent * 100) / 100),
					avgSalesWhenAbsent: String(Math.round(avgSalesWhenAbsent * 100) / 100),
					salesImpact: String(Math.round(salesImpact * 100) / 100),
					impactConfidence: String(impactConfidence),
					computedAt: new Date(),
					updatedAt: new Date()
				}
			});
		workersAnalyzed++;
	}

	log.info({ workersAnalyzed, periodStart: startStr, periodEnd: endStr }, 'Worker impact computed');

	return { workersAnalyzed, periodStart: startStr, periodEnd: endStr };
}

/**
 * Compute staffing level metrics
 */
export async function computeStaffingLevels(startDate: Date, endDate: Date): Promise<{
	levelsComputed: number;
	periodStart: string;
	periodEnd: string;
}> {
	const startStr = toPacificDateString(startDate);
	const endStr = toPacificDateString(endDate);

	log.info({ startDate: startStr, endDate: endStr }, 'Computing staffing levels');

	const dailyData = await getDailySalesAndStaffing({ start: startDate, end: endDate });

	// Group by worker count
	const levelStats = new Map<number, {
		daysObserved: number;
		totalHours: number;
		totalSales: number;
		salesList: number[];
	}>();

	for (const day of dailyData) {
		const workerCount = day.workersPresent.size;
		if (workerCount === 0) continue;

		const existing = levelStats.get(workerCount) || {
			daysObserved: 0,
			totalHours: 0,
			totalSales: 0,
			salesList: []
		};
		existing.daysObserved++;
		existing.totalHours += day.totalHours;
		existing.totalSales += day.totalSales;
		existing.salesList.push(day.totalSales);
		levelStats.set(workerCount, existing);
	}

	// Upsert level data
	let levelsComputed = 0;
	for (const [workerCount, stats] of levelStats) {
		const avgTotalHours = stats.totalHours / stats.daysObserved;
		const avgDailySales = stats.totalSales / stats.daysObserved;
		const minDailySales = Math.min(...stats.salesList);
		const maxDailySales = Math.max(...stats.salesList);

		await db
			.insert(staffingLevelMetrics)
			.values({
				periodStart: startStr,
				periodEnd: endStr,
				workerCount,
				daysObserved: stats.daysObserved,
				avgTotalHours: String(Math.round(avgTotalHours * 100) / 100),
				avgDailySales: String(Math.round(avgDailySales * 100) / 100),
				minDailySales: String(Math.round(minDailySales * 100) / 100),
				maxDailySales: String(Math.round(maxDailySales * 100) / 100)
			})
			.onConflictDoUpdate({
				target: [
					staffingLevelMetrics.workerCount,
					staffingLevelMetrics.periodStart,
					staffingLevelMetrics.periodEnd
				],
				set: {
					daysObserved: stats.daysObserved,
					avgTotalHours: String(Math.round(avgTotalHours * 100) / 100),
					avgDailySales: String(Math.round(avgDailySales * 100) / 100),
					minDailySales: String(Math.round(minDailySales * 100) / 100),
					maxDailySales: String(Math.round(maxDailySales * 100) / 100),
					computedAt: new Date()
				}
			});
		levelsComputed++;
	}

	log.info({ levelsComputed, periodStart: startStr, periodEnd: endStr }, 'Staffing levels computed');

	return { levelsComputed, periodStart: startStr, periodEnd: endStr };
}

/**
 * Compute day of week patterns
 */
export async function computeDayOfWeekPatterns(startDate: Date, endDate: Date): Promise<{
	daysAnalyzed: number;
	periodStart: string;
	periodEnd: string;
}> {
	const startStr = toPacificDateString(startDate);
	const endStr = toPacificDateString(endDate);

	log.info({ startDate: startStr, endDate: endStr }, 'Computing day of week patterns');

	const dailyData = await getDailySalesAndStaffing({ start: startDate, end: endDate });

	// Group by day of week
	const dayStats = new Map<number, {
		daysObserved: number;
		totalWorkers: number;
		totalHours: number;
		totalSales: number;
		totalRetained: number;
	}>();

	for (const day of dailyData) {
		const date = new Date(day.date + 'T12:00:00'); // Use noon to avoid timezone issues
		const dayOfWeek = date.getDay();

		const existing = dayStats.get(dayOfWeek) || {
			daysObserved: 0,
			totalWorkers: 0,
			totalHours: 0,
			totalSales: 0,
			totalRetained: 0
		};
		existing.daysObserved++;
		existing.totalWorkers += day.workersPresent.size;
		existing.totalHours += day.totalHours;
		existing.totalSales += day.totalSales;
		existing.totalRetained += day.totalRetained;
		dayStats.set(dayOfWeek, existing);
	}

	// Upsert day of week data
	let daysAnalyzed = 0;
	for (const [dayOfWeek, stats] of dayStats) {
		const avgWorkerCount = stats.totalWorkers / stats.daysObserved;
		const avgTotalHours = stats.totalHours / stats.daysObserved;
		const avgDailySales = stats.totalSales / stats.daysObserved;
		const avgRetained = stats.totalRetained / stats.daysObserved;

		await db
			.insert(dayOfWeekMetrics)
			.values({
				periodStart: startStr,
				periodEnd: endStr,
				dayOfWeek,
				daysObserved: stats.daysObserved,
				avgWorkerCount: String(Math.round(avgWorkerCount * 100) / 100),
				avgTotalHours: String(Math.round(avgTotalHours * 100) / 100),
				avgDailySales: String(Math.round(avgDailySales * 100) / 100),
				avgRetained: String(Math.round(avgRetained * 100) / 100)
			})
			.onConflictDoUpdate({
				target: [
					dayOfWeekMetrics.dayOfWeek,
					dayOfWeekMetrics.periodStart,
					dayOfWeekMetrics.periodEnd
				],
				set: {
					daysObserved: stats.daysObserved,
					avgWorkerCount: String(Math.round(avgWorkerCount * 100) / 100),
					avgTotalHours: String(Math.round(avgTotalHours * 100) / 100),
					avgDailySales: String(Math.round(avgDailySales * 100) / 100),
					avgRetained: String(Math.round(avgRetained * 100) / 100),
					computedAt: new Date()
				}
			});
		daysAnalyzed++;
	}

	log.info({ daysAnalyzed, periodStart: startStr, periodEnd: endStr }, 'Day of week patterns computed');

	return { daysAnalyzed, periodStart: startStr, periodEnd: endStr };
}

/**
 * Compute all staffing analytics for a date range
 */
export async function computeAllStaffingAnalytics(startDate: Date, endDate: Date): Promise<{
	pairs: { pairsComputed: number };
	impact: { workersAnalyzed: number };
	staffingLevels: { levelsComputed: number };
	dayOfWeek: { daysAnalyzed: number };
	periodStart: string;
	periodEnd: string;
}> {
	log.info({ startDate, endDate }, 'Computing all staffing analytics');

	const pairs = await computeWorkerPairs(startDate, endDate);
	const impact = await computeWorkerImpact(startDate, endDate);
	const staffingLevels = await computeStaffingLevels(startDate, endDate);
	const dayOfWeek = await computeDayOfWeekPatterns(startDate, endDate);

	return {
		pairs: { pairsComputed: pairs.pairsComputed },
		impact: { workersAnalyzed: impact.workersAnalyzed },
		staffingLevels: { levelsComputed: staffingLevels.levelsComputed },
		dayOfWeek: { daysAnalyzed: dayOfWeek.daysAnalyzed },
		periodStart: pairs.periodStart,
		periodEnd: pairs.periodEnd
	};
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get top worker pairs by average daily sales
 */
export async function getTopWorkerPairs(options: {
	periodStart: string;
	periodEnd: string;
	minDays?: number;
	limit?: number;
	orderBy?: 'avgDailySales' | 'daysTogether' | 'totalSales';
}): Promise<WorkerPairData[]> {
	const { periodStart, periodEnd, minDays = 2, limit = 10, orderBy = 'avgDailySales' } = options;

	const orderColumn = {
		avgDailySales: workerPairPerformance.avgDailySales,
		daysTogether: workerPairPerformance.daysTogether,
		totalSales: workerPairPerformance.totalSales
	}[orderBy];

	const results = await db
		.select({
			userId1: workerPairPerformance.userId1,
			userName1: sql<string>`u1.name`,
			userId2: workerPairPerformance.userId2,
			userName2: sql<string>`u2.name`,
			daysTogether: workerPairPerformance.daysTogether,
			totalSales: workerPairPerformance.totalSales,
			avgDailySales: workerPairPerformance.avgDailySales
		})
		.from(workerPairPerformance)
		.leftJoin(sql`${users} u1`, sql`${workerPairPerformance.userId1} = u1.id`)
		.leftJoin(sql`${users} u2`, sql`${workerPairPerformance.userId2} = u2.id`)
		.where(
			and(
				eq(workerPairPerformance.periodStart, periodStart),
				eq(workerPairPerformance.periodEnd, periodEnd),
				gte(workerPairPerformance.daysTogether, minDays)
			)
		)
		.orderBy(desc(sql`CAST(${orderColumn} AS DECIMAL)`))
		.limit(limit);

	return results.map(r => ({
		userId1: r.userId1,
		userName1: r.userName1 || 'Unknown',
		userId2: r.userId2,
		userName2: r.userName2 || 'Unknown',
		daysTogether: r.daysTogether,
		totalSales: parseFloat(r.totalSales),
		avgDailySales: parseFloat(r.avgDailySales)
	}));
}

/**
 * Get worker efficiency rankings ($/hour)
 */
export async function getWorkerEfficiency(options: {
	periodStart: string;
	periodEnd: string;
	minHours?: number;
	limit?: number;
}): Promise<WorkerImpactData[]> {
	const { periodStart, periodEnd, minHours = 10, limit = 20 } = options;

	const results = await db
		.select({
			userId: workerImpactMetrics.userId,
			userName: users.name,
			totalHoursWorked: workerImpactMetrics.totalHoursWorked,
			totalAttributedSales: workerImpactMetrics.totalAttributedSales,
			salesPerHour: workerImpactMetrics.salesPerHour,
			daysWorked: workerImpactMetrics.daysWorked,
			avgSalesWhenPresent: workerImpactMetrics.avgSalesWhenPresent,
			avgSalesWhenAbsent: workerImpactMetrics.avgSalesWhenAbsent,
			salesImpact: workerImpactMetrics.salesImpact,
			impactConfidence: workerImpactMetrics.impactConfidence
		})
		.from(workerImpactMetrics)
		.leftJoin(users, eq(workerImpactMetrics.userId, users.id))
		.where(
			and(
				eq(workerImpactMetrics.periodStart, periodStart),
				eq(workerImpactMetrics.periodEnd, periodEnd),
				gte(sql`CAST(${workerImpactMetrics.totalHoursWorked} AS DECIMAL)`, minHours)
			)
		)
		.orderBy(desc(sql`CAST(${workerImpactMetrics.salesPerHour} AS DECIMAL)`))
		.limit(limit);

	return results.map(r => ({
		userId: r.userId,
		userName: r.userName || 'Unknown',
		totalHoursWorked: parseFloat(r.totalHoursWorked || '0'),
		totalAttributedSales: parseFloat(r.totalAttributedSales || '0'),
		salesPerHour: parseFloat(r.salesPerHour || '0'),
		daysWorked: r.daysWorked || 0,
		avgSalesWhenPresent: parseFloat(r.avgSalesWhenPresent || '0'),
		avgSalesWhenAbsent: parseFloat(r.avgSalesWhenAbsent || '0'),
		salesImpact: parseFloat(r.salesImpact || '0'),
		impactConfidence: parseFloat(r.impactConfidence || '0')
	}));
}

/**
 * Get worker impact analysis (sales when present vs absent)
 */
export async function getWorkerImpact(options: {
	periodStart: string;
	periodEnd: string;
	minDaysWorked?: number;
	limit?: number;
}): Promise<WorkerImpactData[]> {
	const { periodStart, periodEnd, minDaysWorked = 5, limit = 20 } = options;

	const results = await db
		.select({
			userId: workerImpactMetrics.userId,
			userName: users.name,
			totalHoursWorked: workerImpactMetrics.totalHoursWorked,
			totalAttributedSales: workerImpactMetrics.totalAttributedSales,
			salesPerHour: workerImpactMetrics.salesPerHour,
			daysWorked: workerImpactMetrics.daysWorked,
			avgSalesWhenPresent: workerImpactMetrics.avgSalesWhenPresent,
			avgSalesWhenAbsent: workerImpactMetrics.avgSalesWhenAbsent,
			salesImpact: workerImpactMetrics.salesImpact,
			impactConfidence: workerImpactMetrics.impactConfidence
		})
		.from(workerImpactMetrics)
		.leftJoin(users, eq(workerImpactMetrics.userId, users.id))
		.where(
			and(
				eq(workerImpactMetrics.periodStart, periodStart),
				eq(workerImpactMetrics.periodEnd, periodEnd),
				gte(workerImpactMetrics.daysWorked, minDaysWorked)
			)
		)
		.orderBy(desc(sql`CAST(${workerImpactMetrics.salesImpact} AS DECIMAL)`))
		.limit(limit);

	return results.map(r => ({
		userId: r.userId,
		userName: r.userName || 'Unknown',
		totalHoursWorked: parseFloat(r.totalHoursWorked || '0'),
		totalAttributedSales: parseFloat(r.totalAttributedSales || '0'),
		salesPerHour: parseFloat(r.salesPerHour || '0'),
		daysWorked: r.daysWorked || 0,
		avgSalesWhenPresent: parseFloat(r.avgSalesWhenPresent || '0'),
		avgSalesWhenAbsent: parseFloat(r.avgSalesWhenAbsent || '0'),
		salesImpact: parseFloat(r.salesImpact || '0'),
		impactConfidence: parseFloat(r.impactConfidence || '0')
	}));
}

/**
 * Get staffing level optimization data
 */
export async function getStaffingOptimization(options: {
	periodStart: string;
	periodEnd: string;
}): Promise<StaffingLevelData[]> {
	const { periodStart, periodEnd } = options;

	const results = await db
		.select()
		.from(staffingLevelMetrics)
		.where(
			and(
				eq(staffingLevelMetrics.periodStart, periodStart),
				eq(staffingLevelMetrics.periodEnd, periodEnd)
			)
		)
		.orderBy(asc(staffingLevelMetrics.workerCount));

	return results.map(r => ({
		workerCount: r.workerCount,
		daysObserved: r.daysObserved || 0,
		avgTotalHours: parseFloat(r.avgTotalHours || '0'),
		avgDailySales: parseFloat(r.avgDailySales || '0'),
		minDailySales: parseFloat(r.minDailySales || '0'),
		maxDailySales: parseFloat(r.maxDailySales || '0')
	}));
}

/**
 * Get day of week analysis
 */
export async function getDayOfWeekAnalysis(options: {
	periodStart: string;
	periodEnd: string;
}): Promise<DayOfWeekData[]> {
	const { periodStart, periodEnd } = options;

	const results = await db
		.select()
		.from(dayOfWeekMetrics)
		.where(
			and(
				eq(dayOfWeekMetrics.periodStart, periodStart),
				eq(dayOfWeekMetrics.periodEnd, periodEnd)
			)
		)
		.orderBy(asc(dayOfWeekMetrics.dayOfWeek));

	return results.map(r => ({
		dayOfWeek: r.dayOfWeek,
		dayName: getDayName(r.dayOfWeek),
		daysObserved: r.daysObserved || 0,
		avgWorkerCount: parseFloat(r.avgWorkerCount || '0'),
		avgTotalHours: parseFloat(r.avgTotalHours || '0'),
		avgDailySales: parseFloat(r.avgDailySales || '0'),
		avgRetained: parseFloat(r.avgRetained || '0')
	}));
}

/**
 * Generate staffing insights based on computed analytics
 */
export async function generateStaffingInsights(options: {
	periodStart: string;
	periodEnd: string;
}): Promise<StaffingInsight[]> {
	const { periodStart, periodEnd } = options;

	const insights: StaffingInsight[] = [];

	// Get data
	const [pairs, efficiency, impact, staffingLevels, dayOfWeek] = await Promise.all([
		getTopWorkerPairs({ periodStart, periodEnd, limit: 5 }),
		getWorkerEfficiency({ periodStart, periodEnd, limit: 10 }),
		getWorkerImpact({ periodStart, periodEnd, limit: 10 }),
		getStaffingOptimization({ periodStart, periodEnd }),
		getDayOfWeekAnalysis({ periodStart, periodEnd })
	]);

	// Best worker pair insight
	if (pairs.length > 0) {
		const best = pairs[0];
		insights.push({
			type: 'pair',
			priority: 'high',
			message: `Best performing pair: ${best.userName1} + ${best.userName2} average $${best.avgDailySales.toFixed(2)}/day over ${best.daysTogether} days together`,
			data: { pair: best }
		});
	}

	// Top efficiency insight
	if (efficiency.length > 0) {
		const top = efficiency[0];
		insights.push({
			type: 'efficiency',
			priority: 'high',
			message: `Most efficient: ${top.userName} generates $${top.salesPerHour.toFixed(2)}/hour (${top.totalHoursWorked.toFixed(1)}h worked)`,
			data: { worker: top }
		});
	}

	// Positive impact insight
	const positiveImpact = impact.filter(i => i.salesImpact > 0 && i.impactConfidence > 0.5);
	if (positiveImpact.length > 0) {
		const best = positiveImpact[0];
		insights.push({
			type: 'impact',
			priority: 'medium',
			message: `${best.userName} correlates with +$${best.salesImpact.toFixed(2)} daily sales when present (${Math.round(best.impactConfidence * 100)}% confidence)`,
			data: { worker: best }
		});
	}

	// Optimal staffing level insight
	if (staffingLevels.length > 0) {
		const optimal = [...staffingLevels].sort((a, b) => b.avgDailySales - a.avgDailySales)[0];
		insights.push({
			type: 'staffing',
			priority: 'medium',
			message: `Optimal staffing: ${optimal.workerCount} workers averages $${optimal.avgDailySales.toFixed(2)}/day (observed ${optimal.daysObserved} days)`,
			data: { level: optimal }
		});
	}

	// Best/worst day of week insight
	if (dayOfWeek.length > 0) {
		const sorted = [...dayOfWeek].sort((a, b) => b.avgDailySales - a.avgDailySales);
		const best = sorted[0];
		const worst = sorted[sorted.length - 1];

		insights.push({
			type: 'dayOfWeek',
			priority: 'low',
			message: `Best day: ${best.dayName} ($${best.avgDailySales.toFixed(2)} avg). Consider additional staff on ${best.dayName}s.`,
			data: { best, worst }
		});

		if (worst.avgDailySales < best.avgDailySales * 0.7) {
			insights.push({
				type: 'dayOfWeek',
				priority: 'low',
				message: `${worst.dayName} sales are ${Math.round((1 - worst.avgDailySales / best.avgDailySales) * 100)}% lower than ${best.dayName}. Consider reduced staffing.`,
				data: { worst }
			});
		}
	}

	return insights;
}
