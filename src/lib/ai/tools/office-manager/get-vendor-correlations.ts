/**
 * @module AI/Tools/GetVendorCorrelations
 * @description AI tool for analyzing vendor-employee correlations.
 *
 * Identifies patterns between employees and vendor sales performance:
 * - Which employees correlate with higher sales for specific vendors
 * - Performance comparisons against team averages
 * - Strength of correlations based on sample size
 *
 * Use cases:
 * - "Which employee sells Vendor X products best?"
 * - "Show me Sarah's vendor performance correlations"
 * - "Who should we schedule when we have a lot of vintage inventory?"
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 */
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { eq, desc, gte, lte, and, isNotNull } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import {
	getPacificDayBounds,
	toPacificDateString,
	parsePacificDate
} from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:get-vendor-correlations');

interface GetVendorCorrelationsParams {
	userId?: string; // Filter by employee
	vendorId?: string; // Filter by vendor
	topN?: number; // Get top N correlations (default: 5)
	positive?: boolean; // true=best performers, false=worst (default: true)
	periodType?: 'daily' | 'weekly' | 'monthly'; // Aggregation period (default: daily)
	dateRange?: {
		start?: string; // ISO date YYYY-MM-DD
		end?: string;
	};
}

interface VendorCorrelation {
	userId: string;
	userName: string;
	vendorId: string;
	vendorName: string;
	// Performance metrics
	avgSalesWhenWorking: number; // Average vendor sales when this employee worked
	teamAvgSales: number; // Team average for this vendor
	performanceDelta: number; // Percentage above/below team average
	// Confidence metrics
	daysWorked: number; // Number of days this employee worked with this vendor's sales
	totalDaysWithVendor: number; // Total days with this vendor's sales
	correlationStrength: 'strong' | 'moderate' | 'weak'; // Based on sample size
}

interface GetVendorCorrelationsResult {
	success: boolean;
	periodType?: string;
	dateRange?: {
		start: string;
		end: string;
	};
	correlations?: VendorCorrelation[];
	insights?: string[];
	error?: string;
}

// Helper to get date range defaults
function getDateRange(params: GetVendorCorrelationsParams): { start: Date; end: Date } {
	const now = new Date();
	const end = params.dateRange?.end
		? parsePacificDate(params.dateRange.end)
		: getPacificDayBounds(now).end;

	// Default to 30 days for better correlation data
	const start = params.dateRange?.start
		? parsePacificDate(params.dateRange.start)
		: (() => {
				const d = new Date(end);
				d.setDate(d.getDate() - 30);
				return getPacificDayBounds(d).start;
			})();

	return { start, end };
}

// Determine correlation strength based on sample size
function getCorrelationStrength(
	daysWorked: number,
	totalDays: number
): 'strong' | 'moderate' | 'weak' {
	const coverage = daysWorked / totalDays;
	if (daysWorked >= 10 && coverage >= 0.3) return 'strong';
	if (daysWorked >= 5 && coverage >= 0.15) return 'moderate';
	return 'weak';
}

export const getVendorCorrelationsTool: AITool<
	GetVendorCorrelationsParams,
	GetVendorCorrelationsResult
> = {
	name: 'get_vendor_correlations',
	description:
		'Analyze correlations between employees and vendor sales performance. Identifies which employees correlate with higher (or lower) sales for specific vendors. Useful for scheduling optimization and understanding team strengths.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'Filter correlations for a specific employee (UUID)'
			},
			vendorId: {
				type: 'string',
				description: 'Filter correlations for a specific vendor ID'
			},
			topN: {
				type: 'number',
				description: 'Number of top correlations to return (default: 5)'
			},
			positive: {
				type: 'boolean',
				description: 'If true, return best performers. If false, return worst. Default: true'
			},
			periodType: {
				type: 'string',
				enum: ['daily', 'weekly', 'monthly'],
				description: 'Aggregation period for analysis (default: daily)'
			},
			dateRange: {
				type: 'object',
				properties: {
					start: {
						type: 'string',
						description: 'Start date in YYYY-MM-DD format'
					},
					end: {
						type: 'string',
						description: 'End date in YYYY-MM-DD format'
					}
				},
				description: 'Date range for the analysis. Defaults to last 30 days.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,
	rateLimit: {
		maxPerHour: 30
	},

	validate(params: GetVendorCorrelationsParams) {
		if (params.userId) {
			const validation = validateUserId(params.userId, 'userId');
			if (!validation.valid) return validation;
		}

		if (params.topN && (params.topN < 1 || params.topN > 50)) {
			return { valid: false, error: 'topN must be between 1 and 50' };
		}

		if (params.dateRange?.start) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.dateRange.start)) {
				return { valid: false, error: 'dateRange.start must be in YYYY-MM-DD format' };
			}
		}

		if (params.dateRange?.end) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.dateRange.end)) {
				return { valid: false, error: 'dateRange.end must be in YYYY-MM-DD format' };
			}
		}

		return { valid: true };
	},

	async execute(
		params: GetVendorCorrelationsParams,
		context: ToolExecutionContext
	): Promise<GetVendorCorrelationsResult> {
		try {
			const dateRange = getDateRange(params);
			const startDateStr = toPacificDateString(dateRange.start);
			const endDateStr = toPacificDateString(dateRange.end);
			const topN = params.topN || 5;
			const positive = params.positive !== false; // Default to true

			// Get all sales snapshots in the date range
			const snapshots = await db
				.select({
					saleDate: salesSnapshots.saleDate,
					vendors: salesSnapshots.vendors,
					capturedAt: salesSnapshots.capturedAt
				})
				.from(salesSnapshots)
				.where(
					and(
						gte(salesSnapshots.saleDate, startDateStr),
						lte(salesSnapshots.saleDate, endDateStr)
					)
				)
				.orderBy(desc(salesSnapshots.saleDate));

			if (snapshots.length === 0) {
				return {
					success: true,
					periodType: params.periodType || 'daily',
					dateRange: { start: startDateStr, end: endDateStr },
					error: 'No sales data available for this date range'
				};
			}

			// Build a map of date -> employees who worked that day
			const dateEmployeeMap = new Map<string, Set<string>>();
			const employeeNames = new Map<string, string>();

			// Get time entries for the period
			const entries = await db
				.select({
					userId: timeEntries.userId,
					clockIn: timeEntries.clockIn,
					clockOut: timeEntries.clockOut,
					userName: users.name
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

			// Map employees to dates they worked
			for (const entry of entries) {
				const dateStr = toPacificDateString(entry.clockIn);
				if (!dateEmployeeMap.has(dateStr)) {
					dateEmployeeMap.set(dateStr, new Set());
				}
				dateEmployeeMap.get(dateStr)!.add(entry.userId);
				if (entry.userName) {
					employeeNames.set(entry.userId, entry.userName);
				}
			}

			// Filter by userId if specified
			if (params.userId) {
				const userWorkedDates = new Set<string>();
				for (const [date, employees] of dateEmployeeMap) {
					if (employees.has(params.userId)) {
						userWorkedDates.add(date);
					}
				}
				// Only keep dates where this user worked
				for (const [date] of dateEmployeeMap) {
					if (!userWorkedDates.has(date)) {
						dateEmployeeMap.delete(date);
					} else {
						dateEmployeeMap.set(date, new Set([params.userId]));
					}
				}
			}

			// Build vendor sales data
			interface VendorDayData {
				vendorId: string;
				vendorName: string;
				date: string;
				sales: number;
				employeesWorking: string[];
			}

			const vendorDayData: VendorDayData[] = [];

			for (const snapshot of snapshots) {
				const vendors = (snapshot.vendors as Array<{
					vendor_id: string;
					vendor_name: string;
					total_sales: number;
				}>) || [];

				for (const v of vendors) {
					// Filter by vendorId if specified
					if (params.vendorId && v.vendor_id !== params.vendorId) {
						continue;
					}

					const employeesWorking = dateEmployeeMap.get(snapshot.saleDate);
					if (employeesWorking && employeesWorking.size > 0) {
						vendorDayData.push({
							vendorId: v.vendor_id,
							vendorName: v.vendor_name,
							date: snapshot.saleDate,
							sales: v.total_sales,
							employeesWorking: Array.from(employeesWorking)
						});
					}
				}
			}

			if (vendorDayData.length === 0) {
				return {
					success: true,
					periodType: params.periodType || 'daily',
					dateRange: { start: startDateStr, end: endDateStr },
					error: 'No correlation data available (no overlap between sales and time entries)'
				};
			}

			// Calculate vendor team averages
			const vendorTeamAvg = new Map<string, { totalSales: number; dayCount: number }>();
			for (const vd of vendorDayData) {
				const existing = vendorTeamAvg.get(vd.vendorId) || { totalSales: 0, dayCount: 0 };
				existing.totalSales += vd.sales;
				existing.dayCount++;
				vendorTeamAvg.set(vd.vendorId, existing);
			}

			// Calculate employee-vendor correlations
			// Key: `${userId}:${vendorId}`
			const employeeVendorStats = new Map<
				string,
				{
					userId: string;
					vendorId: string;
					vendorName: string;
					totalSales: number;
					daysWorked: number;
				}
			>();

			for (const vd of vendorDayData) {
				for (const userId of vd.employeesWorking) {
					const key = `${userId}:${vd.vendorId}`;
					const existing = employeeVendorStats.get(key) || {
						userId,
						vendorId: vd.vendorId,
						vendorName: vd.vendorName,
						totalSales: 0,
						daysWorked: 0
					};
					existing.totalSales += vd.sales;
					existing.daysWorked++;
					employeeVendorStats.set(key, existing);
				}
			}

			// Build correlations
			const correlations: VendorCorrelation[] = [];

			for (const [, stats] of employeeVendorStats) {
				const vendorAvg = vendorTeamAvg.get(stats.vendorId);
				if (!vendorAvg || stats.daysWorked < 2) continue; // Need at least 2 days for meaningful correlation

				const avgSalesWhenWorking = stats.totalSales / stats.daysWorked;
				const teamAvgSales = vendorAvg.totalSales / vendorAvg.dayCount;
				const performanceDelta =
					teamAvgSales > 0
						? Math.round(((avgSalesWhenWorking - teamAvgSales) / teamAvgSales) * 100)
						: 0;

				correlations.push({
					userId: stats.userId,
					userName: employeeNames.get(stats.userId) || 'Unknown',
					vendorId: stats.vendorId,
					vendorName: stats.vendorName,
					avgSalesWhenWorking: Math.round(avgSalesWhenWorking * 100) / 100,
					teamAvgSales: Math.round(teamAvgSales * 100) / 100,
					performanceDelta,
					daysWorked: stats.daysWorked,
					totalDaysWithVendor: vendorAvg.dayCount,
					correlationStrength: getCorrelationStrength(stats.daysWorked, vendorAvg.dayCount)
				});
			}

			// Sort by performance delta (descending for positive, ascending for negative)
			correlations.sort((a, b) =>
				positive ? b.performanceDelta - a.performanceDelta : a.performanceDelta - b.performanceDelta
			);

			// Take top N
			const topCorrelations = correlations.slice(0, topN);

			// Generate insights
			const insights: string[] = [];

			if (topCorrelations.length > 0) {
				const bestCorr = topCorrelations[0];
				if (positive) {
					insights.push(
						`${bestCorr.userName} has ${bestCorr.performanceDelta}% higher sales for ${bestCorr.vendorName} compared to team average`
					);
				} else {
					insights.push(
						`${bestCorr.userName} has ${Math.abs(bestCorr.performanceDelta)}% lower sales for ${bestCorr.vendorName} compared to team average`
					);
				}
			}

			// Find strong correlations
			const strongCorrs = topCorrelations.filter((c) => c.correlationStrength === 'strong');
			if (strongCorrs.length > 0) {
				insights.push(`${strongCorrs.length} correlations have strong confidence (10+ days data)`);
			}

			// Find patterns by employee
			if (!params.userId && topCorrelations.length > 2) {
				const employeeCounts = new Map<string, number>();
				for (const c of topCorrelations) {
					employeeCounts.set(c.userName, (employeeCounts.get(c.userName) || 0) + 1);
				}
				const multiVendorEmployee = Array.from(employeeCounts.entries()).find(
					([, count]) => count >= 2
				);
				if (multiVendorEmployee) {
					insights.push(
						`${multiVendorEmployee[0]} appears in ${multiVendorEmployee[1]} top correlations - may be a consistent ${positive ? 'high' : 'low'} performer`
					);
				}
			}

			return {
				success: true,
				periodType: params.periodType || 'daily',
				dateRange: { start: startDateStr, end: endDateStr },
				correlations: topCorrelations,
				insights
			};
		} catch (error) {
			log.error({ error }, 'Get vendor correlations tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetVendorCorrelationsResult): string {
		if (!result.success) {
			return `Failed to get vendor correlations: ${result.error}`;
		}

		if (result.error) {
			return result.error;
		}

		const parts: string[] = [];

		// Header
		parts.push(
			`Vendor-Employee Correlations (${result.dateRange?.start} to ${result.dateRange?.end})`
		);

		// Correlations
		if (result.correlations && result.correlations.length > 0) {
			parts.push(`\nTop Correlations:`);
			for (const c of result.correlations) {
				const sign = c.performanceDelta >= 0 ? '+' : '';
				const strengthLabel =
					c.correlationStrength === 'strong'
						? '[STRONG]'
						: c.correlationStrength === 'moderate'
							? '[moderate]'
							: '[weak]';
				parts.push(
					`  - ${c.userName} + ${c.vendorName}: ${sign}${c.performanceDelta}% vs avg ${strengthLabel}`
				);
				parts.push(
					`    Avg sales when working: $${c.avgSalesWhenWorking.toFixed(2)} (team avg: $${c.teamAvgSales.toFixed(2)})`
				);
				parts.push(`    Data: ${c.daysWorked} of ${c.totalDaysWithVendor} days`);
			}
		} else {
			parts.push('\nNo significant correlations found.');
		}

		// Insights
		if (result.insights && result.insights.length > 0) {
			parts.push(`\nInsights:`);
			for (const insight of result.insights) {
				parts.push(`  * ${insight}`);
			}
		}

		return parts.join('\n');
	}
};
