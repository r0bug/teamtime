// Analyze Sales Patterns Tool - Revenue Optimizer tool for sales and staffing analysis
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:analyze-sales-patterns');

interface AnalyzeSalesPatternsParams {
	analysisType: 'daily_summary' | 'hourly_velocity' | 'labor_efficiency' | 'vendor_performance' | 'weekly_trends';
	startDate?: string; // YYYY-MM-DD
	endDate?: string; // YYYY-MM-DD
	daysBack?: number; // Alternative to date range
}

interface DailySummary {
	date: string;
	totalSales: number;
	totalRetained: number;
	vendorCount: number;
	laborHours: number;
	laborCost: number;
	profitAfterLabor: number;
	salesPerLaborHour: number;
	staffOnDuty: string[];
}

interface HourlyVelocity {
	date: string;
	hour: number;
	salesAtHour: number;
	salesVelocity: number; // Sales since previous snapshot
	staffOnDuty: string[];
}

interface LaborEfficiency {
	userName: string;
	userId: string;
	totalHours: number;
	daysWorked: number;
	avgSalesWhenWorking: number;
	avgRetainedWhenWorking: number;
}

interface VendorPerformance {
	vendorId: string;
	vendorName: string;
	totalSales: number;
	totalRetained: number;
	daysActive: number;
	avgDailySales: number;
}

interface WeeklyTrend {
	weekStart: string;
	totalSales: number;
	totalRetained: number;
	totalLaborCost: number;
	netProfit: number;
	avgDailySales: number;
	daysWithData: number;
}

interface AnalyzeSalesPatternsResult {
	success: boolean;
	analysisType: string;
	dateRange: { start: string; end: string };
	dailySummaries?: DailySummary[];
	hourlyVelocity?: HourlyVelocity[];
	laborEfficiency?: LaborEfficiency[];
	vendorPerformance?: VendorPerformance[];
	weeklyTrends?: WeeklyTrend[];
	insights?: string[];
	error?: string;
}

export const analyzeSalesPatternsTool: AITool<AnalyzeSalesPatternsParams, AnalyzeSalesPatternsResult> = {
	name: 'analyze_sales_patterns',
	description: `Analyze sales data and staffing patterns to find insights about profitability, efficiency, and trends.

Analysis types:
- daily_summary: Sales, retained, labor cost, and profit per day
- hourly_velocity: How fast sales accumulate throughout the day (requires multiple snapshots per day)
- labor_efficiency: Which staff correlate with higher sales
- vendor_performance: Top vendors by sales and retained earnings
- weekly_trends: Week-over-week sales and profitability trends

Use this to understand business performance and identify optimization opportunities.`,
	agent: 'revenue_optimizer',
	parameters: {
		type: 'object',
		properties: {
			analysisType: {
				type: 'string',
				enum: ['daily_summary', 'hourly_velocity', 'labor_efficiency', 'vendor_performance', 'weekly_trends'],
				description: 'Type of analysis to perform'
			},
			startDate: {
				type: 'string',
				description: 'Start date (YYYY-MM-DD). If not provided, uses daysBack.'
			},
			endDate: {
				type: 'string',
				description: 'End date (YYYY-MM-DD). Defaults to today.'
			},
			daysBack: {
				type: 'number',
				description: 'Number of days to analyze (default 14). Used if startDate not provided.'
			}
		},
		required: ['analysisType']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 20
	},

	validate(params: AnalyzeSalesPatternsParams) {
		if (!params.analysisType) {
			return { valid: false, error: 'analysisType is required' };
		}
		const validTypes = ['daily_summary', 'hourly_velocity', 'labor_efficiency', 'vendor_performance', 'weekly_trends'];
		if (!validTypes.includes(params.analysisType)) {
			return { valid: false, error: `Invalid analysisType. Must be one of: ${validTypes.join(', ')}` };
		}
		if (params.daysBack && (params.daysBack < 1 || params.daysBack > 365)) {
			return { valid: false, error: 'daysBack must be between 1 and 365' };
		}
		return { valid: true };
	},

	async execute(params: AnalyzeSalesPatternsParams, context: ToolExecutionContext): Promise<AnalyzeSalesPatternsResult> {
		try {
			// Calculate date range
			const endDate = params.endDate ? new Date(params.endDate) : new Date();
			const daysBack = params.daysBack ?? 14;
			const startDate = params.startDate
				? new Date(params.startDate)
				: new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

			const startStr = startDate.toISOString().split('T')[0];
			const endStr = endDate.toISOString().split('T')[0];

			const baseResult: AnalyzeSalesPatternsResult = {
				success: true,
				analysisType: params.analysisType,
				dateRange: { start: startStr, end: endStr },
				insights: []
			};

			switch (params.analysisType) {
				case 'daily_summary':
					return await analyzeDailySummary(startStr, endStr, baseResult);
				case 'hourly_velocity':
					return await analyzeHourlyVelocity(startStr, endStr, baseResult);
				case 'labor_efficiency':
					return await analyzeLaborEfficiency(startStr, endStr, baseResult);
				case 'vendor_performance':
					return await analyzeVendorPerformance(startStr, endStr, baseResult);
				case 'weekly_trends':
					return await analyzeWeeklyTrends(startStr, endStr, baseResult);
				default:
					return { ...baseResult, success: false, error: 'Unknown analysis type' };
			}
		} catch (error) {
			log.error('Analyze sales patterns error', { error });
			return {
				success: false,
				analysisType: params.analysisType,
				dateRange: { start: '', end: '' },
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: AnalyzeSalesPatternsResult): string {
		if (!result.success) {
			return `Analysis failed: ${result.error}`;
		}

		const lines: string[] = [
			`Sales Analysis: ${result.analysisType}`,
			`Period: ${result.dateRange.start} to ${result.dateRange.end}`,
			''
		];

		if (result.dailySummaries) {
			lines.push('Daily Summary:');
			for (const day of result.dailySummaries.slice(-7)) {
				lines.push(`  ${day.date}: Sales $${day.totalSales.toFixed(0)}, Retained $${day.totalRetained.toFixed(0)}, Labor $${day.laborCost.toFixed(0)}, Net $${day.profitAfterLabor.toFixed(0)}`);
			}
		}

		if (result.laborEfficiency) {
			lines.push('Labor Efficiency (top 5):');
			for (const staff of result.laborEfficiency.slice(0, 5)) {
				lines.push(`  ${staff.userName}: ${staff.totalHours.toFixed(1)}hrs, Avg sales when working $${staff.avgSalesWhenWorking.toFixed(0)}`);
			}
		}

		if (result.vendorPerformance) {
			lines.push('Top Vendors:');
			for (const vendor of result.vendorPerformance.slice(0, 5)) {
				lines.push(`  ${vendor.vendorName}: Sales $${vendor.totalSales.toFixed(0)}, Retained $${vendor.totalRetained.toFixed(0)}`);
			}
		}

		if (result.weeklyTrends) {
			lines.push('Weekly Trends:');
			for (const week of result.weeklyTrends) {
				lines.push(`  Week of ${week.weekStart}: Sales $${week.totalSales.toFixed(0)}, Net Profit $${week.netProfit.toFixed(0)}`);
			}
		}

		if (result.insights && result.insights.length > 0) {
			lines.push('');
			lines.push('Insights:');
			for (const insight of result.insights) {
				lines.push(`  - ${insight}`);
			}
		}

		return lines.join('\n');
	}
};

// Helper functions for each analysis type

async function analyzeDailySummary(startDate: string, endDate: string, baseResult: AnalyzeSalesPatternsResult): Promise<AnalyzeSalesPatternsResult> {
	// Get sales snapshots (latest per day)
	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(and(
			gte(salesSnapshots.saleDate, startDate),
			lte(salesSnapshots.saleDate, endDate)
		))
		.orderBy(desc(salesSnapshots.saleDate), desc(salesSnapshots.capturedAt));

	// Dedupe to latest per day
	const dailySnapshots = new Map<string, typeof snapshots[0]>();
	for (const s of snapshots) {
		const dateKey = typeof s.saleDate === 'string' ? s.saleDate : s.saleDate.toISOString().split('T')[0];
		if (!dailySnapshots.has(dateKey)) {
			dailySnapshots.set(dateKey, s);
		}
	}

	// Get time entries for the period
	const entries = await db
		.select({
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			userName: users.name,
			hourlyRate: users.hourlyRate
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(
			gte(timeEntries.clockIn, new Date(startDate)),
			lte(timeEntries.clockIn, new Date(endDate + 'T23:59:59'))
		));

	// Build daily summaries
	const dailySummaries: DailySummary[] = [];

	for (const [dateKey, snapshot] of dailySnapshots) {
		// Calculate labor for this day
		const dayStart = new Date(dateKey + 'T00:00:00');
		const dayEnd = new Date(dateKey + 'T23:59:59');

		let laborHours = 0;
		let laborCost = 0;
		const staffOnDuty = new Set<string>();

		for (const entry of entries) {
			const clockIn = new Date(entry.clockIn);
			const clockOut = entry.clockOut ? new Date(entry.clockOut) : new Date();

			// Check if this entry overlaps with the day
			if (clockIn <= dayEnd && clockOut >= dayStart) {
				const effectiveStart = clockIn < dayStart ? dayStart : clockIn;
				const effectiveEnd = clockOut > dayEnd ? dayEnd : clockOut;
				const hours = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);
				const rate = parseFloat(entry.hourlyRate || '15');

				laborHours += hours;
				laborCost += hours * rate;
				staffOnDuty.add(entry.userName);
			}
		}

		const totalSales = parseFloat(snapshot.totalSales);
		const totalRetained = parseFloat(snapshot.totalRetained);

		dailySummaries.push({
			date: dateKey,
			totalSales,
			totalRetained,
			vendorCount: snapshot.vendorCount,
			laborHours: Math.round(laborHours * 10) / 10,
			laborCost: Math.round(laborCost * 100) / 100,
			profitAfterLabor: Math.round((totalRetained - laborCost) * 100) / 100,
			salesPerLaborHour: laborHours > 0 ? Math.round((totalSales / laborHours) * 100) / 100 : 0,
			staffOnDuty: Array.from(staffOnDuty)
		});
	}

	// Sort by date ascending
	dailySummaries.sort((a, b) => a.date.localeCompare(b.date));

	// Generate insights
	const insights: string[] = [];
	const profitableDays = dailySummaries.filter(d => d.profitAfterLabor > 0);
	const unprofitableDays = dailySummaries.filter(d => d.profitAfterLabor < 0);

	if (unprofitableDays.length > 0) {
		insights.push(`${unprofitableDays.length} days had labor costs exceeding retained earnings`);
	}

	const avgSalesPerHour = dailySummaries.reduce((sum, d) => sum + d.salesPerLaborHour, 0) / dailySummaries.length;
	insights.push(`Average sales per labor hour: $${avgSalesPerHour.toFixed(2)}`);

	const totalProfit = dailySummaries.reduce((sum, d) => sum + d.profitAfterLabor, 0);
	insights.push(`Total net profit for period: $${totalProfit.toFixed(2)}`);

	return {
		...baseResult,
		dailySummaries,
		insights
	};
}

async function analyzeHourlyVelocity(startDate: string, endDate: string, baseResult: AnalyzeSalesPatternsResult): Promise<AnalyzeSalesPatternsResult> {
	// Get all snapshots (not just latest per day)
	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(and(
			gte(salesSnapshots.saleDate, startDate),
			lte(salesSnapshots.saleDate, endDate)
		))
		.orderBy(salesSnapshots.saleDate, salesSnapshots.capturedAt);

	// Group by day and calculate velocity between snapshots
	const hourlyVelocity: HourlyVelocity[] = [];
	let prevSnapshot: typeof snapshots[0] | null = null;
	let prevDateKey: string | null = null;

	for (const snapshot of snapshots) {
		const dateKey = typeof snapshot.saleDate === 'string' ? snapshot.saleDate : snapshot.saleDate.toISOString().split('T')[0];
		const capturedAt = new Date(snapshot.capturedAt);
		const hour = capturedAt.getHours();
		const currentSales = parseFloat(snapshot.totalSales);

		let velocity = 0;
		if (prevSnapshot && prevDateKey === dateKey) {
			const prevSales = parseFloat(prevSnapshot.totalSales);
			velocity = currentSales - prevSales;
		}

		hourlyVelocity.push({
			date: dateKey,
			hour,
			salesAtHour: currentSales,
			salesVelocity: Math.round(velocity * 100) / 100,
			staffOnDuty: [] // Would need to correlate with time entries
		});

		prevSnapshot = snapshot;
		prevDateKey = dateKey;
	}

	// Generate insights
	const insights: string[] = [];
	const velocities = hourlyVelocity.filter(h => h.salesVelocity > 0);
	if (velocities.length > 0) {
		const avgVelocity = velocities.reduce((sum, h) => sum + h.salesVelocity, 0) / velocities.length;
		insights.push(`Average hourly sales velocity: $${avgVelocity.toFixed(2)}`);

		// Find peak hours
		const hourTotals = new Map<number, number[]>();
		for (const v of velocities) {
			if (!hourTotals.has(v.hour)) {
				hourTotals.set(v.hour, []);
			}
			hourTotals.get(v.hour)!.push(v.salesVelocity);
		}

		let peakHour = 0;
		let peakAvg = 0;
		for (const [hour, values] of hourTotals) {
			const avg = values.reduce((a, b) => a + b, 0) / values.length;
			if (avg > peakAvg) {
				peakAvg = avg;
				peakHour = hour;
			}
		}
		insights.push(`Peak sales hour: ${peakHour}:00 with avg velocity $${peakAvg.toFixed(2)}/hr`);
	}

	return {
		...baseResult,
		hourlyVelocity,
		insights
	};
}

async function analyzeLaborEfficiency(startDate: string, endDate: string, baseResult: AnalyzeSalesPatternsResult): Promise<AnalyzeSalesPatternsResult> {
	// Get time entries with user info
	const entries = await db
		.select({
			userId: timeEntries.userId,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(
			gte(timeEntries.clockIn, new Date(startDate)),
			lte(timeEntries.clockIn, new Date(endDate + 'T23:59:59'))
		));

	// Get daily sales
	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(and(
			gte(salesSnapshots.saleDate, startDate),
			lte(salesSnapshots.saleDate, endDate)
		))
		.orderBy(desc(salesSnapshots.capturedAt));

	// Dedupe to latest per day
	const dailySales = new Map<string, { sales: number; retained: number }>();
	for (const s of snapshots) {
		const dateKey = typeof s.saleDate === 'string' ? s.saleDate : s.saleDate.toISOString().split('T')[0];
		if (!dailySales.has(dateKey)) {
			dailySales.set(dateKey, {
				sales: parseFloat(s.totalSales),
				retained: parseFloat(s.totalRetained)
			});
		}
	}

	// Calculate per-staff metrics
	const staffMetrics = new Map<string, {
		name: string;
		totalHours: number;
		daysWorked: Set<string>;
		salesDays: number[];
		retainedDays: number[];
	}>();

	for (const entry of entries) {
		const clockIn = new Date(entry.clockIn);
		const clockOut = entry.clockOut ? new Date(entry.clockOut) : new Date();
		const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
		const dateKey = clockIn.toISOString().split('T')[0];

		if (!staffMetrics.has(entry.userId)) {
			staffMetrics.set(entry.userId, {
				name: entry.userName,
				totalHours: 0,
				daysWorked: new Set(),
				salesDays: [],
				retainedDays: []
			});
		}

		const metrics = staffMetrics.get(entry.userId)!;
		metrics.totalHours += hours;

		if (!metrics.daysWorked.has(dateKey)) {
			metrics.daysWorked.add(dateKey);
			const daySales = dailySales.get(dateKey);
			if (daySales) {
				metrics.salesDays.push(daySales.sales);
				metrics.retainedDays.push(daySales.retained);
			}
		}
	}

	// Build efficiency report
	const laborEfficiency: LaborEfficiency[] = [];
	for (const [userId, metrics] of staffMetrics) {
		const avgSales = metrics.salesDays.length > 0
			? metrics.salesDays.reduce((a, b) => a + b, 0) / metrics.salesDays.length
			: 0;
		const avgRetained = metrics.retainedDays.length > 0
			? metrics.retainedDays.reduce((a, b) => a + b, 0) / metrics.retainedDays.length
			: 0;

		laborEfficiency.push({
			userId,
			userName: metrics.name,
			totalHours: Math.round(metrics.totalHours * 10) / 10,
			daysWorked: metrics.daysWorked.size,
			avgSalesWhenWorking: Math.round(avgSales * 100) / 100,
			avgRetainedWhenWorking: Math.round(avgRetained * 100) / 100
		});
	}

	// Sort by avg sales when working (descending)
	laborEfficiency.sort((a, b) => b.avgSalesWhenWorking - a.avgSalesWhenWorking);

	// Generate insights
	const insights: string[] = [];
	if (laborEfficiency.length > 0) {
		const topPerformer = laborEfficiency[0];
		insights.push(`Highest avg sales when working: ${topPerformer.userName} ($${topPerformer.avgSalesWhenWorking.toFixed(0)}/day)`);
	}

	return {
		...baseResult,
		laborEfficiency,
		insights
	};
}

async function analyzeVendorPerformance(startDate: string, endDate: string, baseResult: AnalyzeSalesPatternsResult): Promise<AnalyzeSalesPatternsResult> {
	// Get all snapshots
	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(and(
			gte(salesSnapshots.saleDate, startDate),
			lte(salesSnapshots.saleDate, endDate)
		))
		.orderBy(desc(salesSnapshots.capturedAt));

	// Dedupe to latest per day
	const dailySnapshots = new Map<string, typeof snapshots[0]>();
	for (const s of snapshots) {
		const dateKey = typeof s.saleDate === 'string' ? s.saleDate : s.saleDate.toISOString().split('T')[0];
		if (!dailySnapshots.has(dateKey)) {
			dailySnapshots.set(dateKey, s);
		}
	}

	// Aggregate vendor performance
	const vendorTotals = new Map<string, {
		name: string;
		sales: number;
		retained: number;
		daysActive: Set<string>;
	}>();

	for (const [dateKey, snapshot] of dailySnapshots) {
		const vendors = snapshot.vendors as Array<{
			vendor_id: string;
			vendor_name: string;
			total_sales: number;
			retained_amount: number;
		}>;

		for (const v of vendors) {
			if (!vendorTotals.has(v.vendor_id)) {
				vendorTotals.set(v.vendor_id, {
					name: v.vendor_name,
					sales: 0,
					retained: 0,
					daysActive: new Set()
				});
			}
			const totals = vendorTotals.get(v.vendor_id)!;
			totals.sales += v.total_sales;
			totals.retained += v.retained_amount;
			totals.daysActive.add(dateKey);
		}
	}

	// Build vendor performance report
	const vendorPerformance: VendorPerformance[] = [];
	for (const [vendorId, totals] of vendorTotals) {
		vendorPerformance.push({
			vendorId,
			vendorName: totals.name,
			totalSales: Math.round(totals.sales * 100) / 100,
			totalRetained: Math.round(totals.retained * 100) / 100,
			daysActive: totals.daysActive.size,
			avgDailySales: Math.round((totals.sales / totals.daysActive.size) * 100) / 100
		});
	}

	// Sort by total sales descending
	vendorPerformance.sort((a, b) => b.totalSales - a.totalSales);

	// Generate insights
	const insights: string[] = [];
	if (vendorPerformance.length > 0) {
		const top5Sales = vendorPerformance.slice(0, 5).reduce((sum, v) => sum + v.totalSales, 0);
		const totalSales = vendorPerformance.reduce((sum, v) => sum + v.totalSales, 0);
		const top5Pct = (top5Sales / totalSales * 100).toFixed(1);
		insights.push(`Top 5 vendors account for ${top5Pct}% of total sales`);
		insights.push(`Total vendors active in period: ${vendorPerformance.length}`);
	}

	return {
		...baseResult,
		vendorPerformance,
		insights
	};
}

async function analyzeWeeklyTrends(startDate: string, endDate: string, baseResult: AnalyzeSalesPatternsResult): Promise<AnalyzeSalesPatternsResult> {
	// Get daily summaries first
	const dailyResult = await analyzeDailySummary(startDate, endDate, baseResult);
	if (!dailyResult.dailySummaries) {
		return { ...baseResult, success: false, error: 'Failed to get daily summaries' };
	}

	// Group by week
	const weekMap = new Map<string, {
		sales: number;
		retained: number;
		laborCost: number;
		days: number;
	}>();

	for (const day of dailyResult.dailySummaries) {
		const date = new Date(day.date);
		// Get Monday of the week
		const dayOfWeek = date.getDay();
		const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const monday = new Date(date);
		monday.setDate(diff);
		const weekKey = monday.toISOString().split('T')[0];

		if (!weekMap.has(weekKey)) {
			weekMap.set(weekKey, { sales: 0, retained: 0, laborCost: 0, days: 0 });
		}
		const week = weekMap.get(weekKey)!;
		week.sales += day.totalSales;
		week.retained += day.totalRetained;
		week.laborCost += day.laborCost;
		week.days += 1;
	}

	// Build weekly trends
	const weeklyTrends: WeeklyTrend[] = [];
	for (const [weekStart, data] of weekMap) {
		weeklyTrends.push({
			weekStart,
			totalSales: Math.round(data.sales * 100) / 100,
			totalRetained: Math.round(data.retained * 100) / 100,
			totalLaborCost: Math.round(data.laborCost * 100) / 100,
			netProfit: Math.round((data.retained - data.laborCost) * 100) / 100,
			avgDailySales: Math.round((data.sales / data.days) * 100) / 100,
			daysWithData: data.days
		});
	}

	// Sort by week
	weeklyTrends.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

	// Generate insights
	const insights: string[] = [];
	if (weeklyTrends.length >= 2) {
		const lastWeek = weeklyTrends[weeklyTrends.length - 1];
		const prevWeek = weeklyTrends[weeklyTrends.length - 2];
		const salesChange = ((lastWeek.totalSales - prevWeek.totalSales) / prevWeek.totalSales * 100).toFixed(1);
		const profitChange = lastWeek.netProfit - prevWeek.netProfit;

		insights.push(`Week-over-week sales change: ${parseFloat(salesChange) >= 0 ? '+' : ''}${salesChange}%`);
		insights.push(`Week-over-week profit change: ${profitChange >= 0 ? '+' : ''}$${profitChange.toFixed(2)}`);
	}

	const totalProfit = weeklyTrends.reduce((sum, w) => sum + w.netProfit, 0);
	insights.push(`Total net profit for period: $${totalProfit.toFixed(2)}`);

	return {
		...baseResult,
		weeklyTrends,
		insights
	};
}
