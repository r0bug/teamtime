/**
 * @module AI/Tools/QueryMetrics
 * @description AI tool for querying performance metrics with natural language parameters.
 *
 * Supports querying various metric types including:
 * - vendor_sales: Sales data by vendor
 * - task_completion_rate: Task completion rates
 * - sales_by_employee: Sales attributed to employees
 * - points_earned: Gamification points
 *
 * Features:
 * - Flexible date range filtering
 * - Dimension-based grouping
 * - Trend calculation with comparisons
 * - Human-readable summaries
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 */
import {
	db,
	salesSnapshots,
	tasks,
	taskCompletions,
	users,
	userStats,
	pointTransactions
} from '$lib/server/db';
import { eq, desc, gte, lte, and, sql, count, isNotNull } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import {
	getPacificDayBounds,
	toPacificDateString,
	parsePacificDate
} from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:query-metrics');

interface QueryMetricsParams {
	metricType?: string; // 'vendor_sales', 'task_completion_rate', 'sales_by_employee', 'points_earned'
	dimensions?: {
		userId?: string;
		vendorId?: string;
	};
	dateRange?: {
		start?: string; // ISO date YYYY-MM-DD
		end?: string;
	};
	groupBy?: string; // 'day', 'week', 'user', 'vendor'
	limit?: number;
}

interface MetricDataPoint {
	label: string;
	value: number;
	secondaryValue?: number;
	change?: number; // Percentage change from previous period
	metadata?: Record<string, unknown>;
}

interface QueryMetricsResult {
	success: boolean;
	metricType?: string;
	dateRange?: {
		start: string;
		end: string;
	};
	summary?: {
		total: number;
		average: number;
		min: number;
		max: number;
		count: number;
		trend?: 'up' | 'down' | 'stable';
		trendPercentage?: number;
	};
	dataPoints?: MetricDataPoint[];
	insights?: string[];
	error?: string;
}

// Helper to get date range defaults
function getDateRange(params: QueryMetricsParams): { start: Date; end: Date } {
	const now = new Date();
	const end = params.dateRange?.end
		? parsePacificDate(params.dateRange.end)
		: getPacificDayBounds(now).end;

	const start = params.dateRange?.start
		? parsePacificDate(params.dateRange.start)
		: (() => {
				const d = new Date(end);
				d.setDate(d.getDate() - 7); // Default to last 7 days
				return getPacificDayBounds(d).start;
			})();

	return { start, end };
}

// Query vendor sales data
async function queryVendorSales(
	params: QueryMetricsParams,
	dateRange: { start: Date; end: Date }
): Promise<QueryMetricsResult> {
	const startDateStr = toPacificDateString(dateRange.start);
	const endDateStr = toPacificDateString(dateRange.end);

	const snapshots = await db
		.select({
			saleDate: salesSnapshots.saleDate,
			totalSales: salesSnapshots.totalSales,
			totalRetained: salesSnapshots.totalRetained,
			vendorCount: salesSnapshots.vendorCount,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(and(gte(salesSnapshots.saleDate, startDateStr), lte(salesSnapshots.saleDate, endDateStr)))
		.orderBy(desc(salesSnapshots.saleDate));

	if (snapshots.length === 0) {
		return {
			success: true,
			metricType: 'vendor_sales',
			dateRange: { start: startDateStr, end: endDateStr },
			error: 'No sales data available for this date range'
		};
	}

	// Aggregate by vendor if groupBy is 'vendor'
	if (params.groupBy === 'vendor') {
		const vendorTotals = new Map<
			string,
			{ name: string; sales: number; retained: number; count: number }
		>();

		for (const snapshot of snapshots) {
			const vendors = (snapshot.vendors as Array<{
				vendor_id: string;
				vendor_name: string;
				total_sales: number;
				retained_amount: number;
			}>) || [];

			for (const v of vendors) {
				// Filter by vendorId if specified
				if (params.dimensions?.vendorId && v.vendor_id !== params.dimensions.vendorId) {
					continue;
				}

				const existing = vendorTotals.get(v.vendor_id);
				if (existing) {
					existing.sales += v.total_sales;
					existing.retained += v.retained_amount;
					existing.count++;
				} else {
					vendorTotals.set(v.vendor_id, {
						name: v.vendor_name,
						sales: v.total_sales,
						retained: v.retained_amount,
						count: 1
					});
				}
			}
		}

		const dataPoints: MetricDataPoint[] = Array.from(vendorTotals.entries())
			.map(([id, data]) => ({
				label: data.name,
				value: Math.round(data.sales * 100) / 100,
				secondaryValue: Math.round(data.retained * 100) / 100,
				metadata: { vendorId: id, dayCount: data.count }
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, params.limit || 10);

		const totalSales = Array.from(vendorTotals.values()).reduce((sum, v) => sum + v.sales, 0);
		const totalRetained = Array.from(vendorTotals.values()).reduce(
			(sum, v) => sum + v.retained,
			0
		);

		return {
			success: true,
			metricType: 'vendor_sales',
			dateRange: { start: startDateStr, end: endDateStr },
			summary: {
				total: Math.round(totalSales * 100) / 100,
				average: Math.round((totalSales / snapshots.length) * 100) / 100,
				min: Math.min(...dataPoints.map((d) => d.value)),
				max: Math.max(...dataPoints.map((d) => d.value)),
				count: vendorTotals.size
			},
			dataPoints,
			insights: [
				`Total sales: $${totalSales.toFixed(2)} from ${vendorTotals.size} vendors over ${snapshots.length} days`,
				`Retained earnings: $${totalRetained.toFixed(2)}`,
				dataPoints[0]
					? `Top vendor: ${dataPoints[0].label} with $${dataPoints[0].value.toFixed(2)}`
					: ''
			].filter(Boolean)
		};
	}

	// Default: aggregate by day
	const dataPoints: MetricDataPoint[] = snapshots
		.map((s) => ({
			label: s.saleDate,
			value: parseFloat(s.totalSales),
			secondaryValue: parseFloat(s.totalRetained),
			metadata: { vendorCount: s.vendorCount }
		}))
		.slice(0, params.limit || 30);

	const values = dataPoints.map((d) => d.value);
	const total = values.reduce((sum, v) => sum + v, 0);

	// Calculate trend by comparing first half to second half
	const midpoint = Math.floor(values.length / 2);
	const firstHalf = values.slice(0, midpoint);
	const secondHalf = values.slice(midpoint);
	const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / (firstHalf.length || 1);
	const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / (secondHalf.length || 1);
	const trendPercentage =
		firstAvg > 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;
	const trend = trendPercentage > 5 ? 'up' : trendPercentage < -5 ? 'down' : 'stable';

	return {
		success: true,
		metricType: 'vendor_sales',
		dateRange: { start: startDateStr, end: endDateStr },
		summary: {
			total: Math.round(total * 100) / 100,
			average: Math.round((total / values.length) * 100) / 100,
			min: Math.round(Math.min(...values) * 100) / 100,
			max: Math.round(Math.max(...values) * 100) / 100,
			count: values.length,
			trend,
			trendPercentage
		},
		dataPoints,
		insights: [
			`${values.length} days of sales data`,
			`Daily average: $${(total / values.length).toFixed(2)}`,
			trend === 'up'
				? `Trending UP ${trendPercentage}% compared to start of period`
				: trend === 'down'
					? `Trending DOWN ${Math.abs(trendPercentage)}% compared to start of period`
					: 'Sales are stable compared to start of period'
		]
	};
}

// Query task completion rate
async function queryTaskCompletionRate(
	params: QueryMetricsParams,
	dateRange: { start: Date; end: Date }
): Promise<QueryMetricsResult> {
	const startDateStr = toPacificDateString(dateRange.start);
	const endDateStr = toPacificDateString(dateRange.end);

	// Build the base query conditions
	const conditions = [
		gte(tasks.createdAt, dateRange.start),
		lte(tasks.createdAt, dateRange.end)
	];

	if (params.dimensions?.userId) {
		conditions.push(eq(tasks.assignedTo, params.dimensions.userId));
	}

	// Get all tasks in the date range
	const allTasks = await db
		.select({
			id: tasks.id,
			status: tasks.status,
			assignedTo: tasks.assignedTo,
			dueAt: tasks.dueAt,
			createdAt: tasks.createdAt
		})
		.from(tasks)
		.where(and(...conditions));

	// Get completions
	const completions = await db
		.select({
			taskId: taskCompletions.taskId,
			completedBy: taskCompletions.completedBy,
			completedAt: taskCompletions.completedAt,
			userName: users.name
		})
		.from(taskCompletions)
		.leftJoin(users, eq(taskCompletions.completedBy, users.id))
		.where(
			and(gte(taskCompletions.completedAt, dateRange.start), lte(taskCompletions.completedAt, dateRange.end))
		);

	const completedTaskIds = new Set(completions.map((c) => c.taskId));
	const completedTasks = allTasks.filter((t) => completedTaskIds.has(t.id));

	// Calculate on-time completions
	let onTimeCount = 0;
	for (const completion of completions) {
		const task = allTasks.find((t) => t.id === completion.taskId);
		if (task?.dueAt && completion.completedAt <= task.dueAt) {
			onTimeCount++;
		}
	}

	const totalTasks = allTasks.length;
	const completedCount = completedTasks.length;
	const completionRate = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
	const onTimeRate = completedCount > 0 ? (onTimeCount / completedCount) * 100 : 0;

	// Group by user if requested
	if (params.groupBy === 'user') {
		const userStats = new Map<
			string,
			{ name: string; assigned: number; completed: number; onTime: number }
		>();

		for (const task of allTasks) {
			if (!task.assignedTo) continue;
			const existing = userStats.get(task.assignedTo) || {
				name: 'Unknown',
				assigned: 0,
				completed: 0,
				onTime: 0
			};
			existing.assigned++;
			userStats.set(task.assignedTo, existing);
		}

		for (const completion of completions) {
			const existing = userStats.get(completion.completedBy);
			if (existing) {
				existing.completed++;
				existing.name = completion.userName || 'Unknown';

				const task = allTasks.find((t) => t.id === completion.taskId);
				if (task?.dueAt && completion.completedAt <= task.dueAt) {
					existing.onTime++;
				}
			}
		}

		const dataPoints: MetricDataPoint[] = Array.from(userStats.entries())
			.map(([userId, stats]) => ({
				label: stats.name,
				value: stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0,
				secondaryValue: stats.completed > 0 ? Math.round((stats.onTime / stats.completed) * 100) : 0,
				metadata: { userId, assigned: stats.assigned, completed: stats.completed, onTime: stats.onTime }
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, params.limit || 10);

		return {
			success: true,
			metricType: 'task_completion_rate',
			dateRange: { start: startDateStr, end: endDateStr },
			summary: {
				total: completedCount,
				average: Math.round(completionRate * 10) / 10,
				min: dataPoints.length > 0 ? Math.min(...dataPoints.map((d) => d.value)) : 0,
				max: dataPoints.length > 0 ? Math.max(...dataPoints.map((d) => d.value)) : 0,
				count: userStats.size
			},
			dataPoints,
			insights: [
				`${completedCount} of ${totalTasks} tasks completed (${completionRate.toFixed(1)}%)`,
				`${onTimeCount} completed on time (${onTimeRate.toFixed(1)}% on-time rate)`,
				dataPoints[0]
					? `Top performer: ${dataPoints[0].label} with ${dataPoints[0].value}% completion rate`
					: ''
			].filter(Boolean)
		};
	}

	return {
		success: true,
		metricType: 'task_completion_rate',
		dateRange: { start: startDateStr, end: endDateStr },
		summary: {
			total: completedCount,
			average: Math.round(completionRate * 10) / 10,
			min: 0,
			max: 100,
			count: totalTasks
		},
		dataPoints: [
			{
				label: 'Completion Rate',
				value: Math.round(completionRate * 10) / 10,
				metadata: { totalTasks, completedCount }
			},
			{
				label: 'On-Time Rate',
				value: Math.round(onTimeRate * 10) / 10,
				metadata: { onTimeCount, completedCount }
			}
		],
		insights: [
			`${completedCount} of ${totalTasks} tasks completed (${completionRate.toFixed(1)}%)`,
			`${onTimeCount} completed on time (${onTimeRate.toFixed(1)}% on-time rate)`,
			totalTasks - completedCount > 0
				? `${totalTasks - completedCount} tasks still pending or incomplete`
				: 'All tasks completed!'
		]
	};
}

// Query points earned
async function queryPointsEarned(
	params: QueryMetricsParams,
	dateRange: { start: Date; end: Date }
): Promise<QueryMetricsResult> {
	const startDateStr = toPacificDateString(dateRange.start);
	const endDateStr = toPacificDateString(dateRange.end);

	const conditions = [
		gte(pointTransactions.earnedAt, dateRange.start),
		lte(pointTransactions.earnedAt, dateRange.end)
	];

	if (params.dimensions?.userId) {
		conditions.push(eq(pointTransactions.userId, params.dimensions.userId));
	}

	const transactions = await db
		.select({
			userId: pointTransactions.userId,
			points: pointTransactions.points,
			category: pointTransactions.category,
			action: pointTransactions.action,
			earnedAt: pointTransactions.earnedAt,
			userName: users.name
		})
		.from(pointTransactions)
		.leftJoin(users, eq(pointTransactions.userId, users.id))
		.where(and(...conditions))
		.orderBy(desc(pointTransactions.earnedAt));

	if (transactions.length === 0) {
		return {
			success: true,
			metricType: 'points_earned',
			dateRange: { start: startDateStr, end: endDateStr },
			error: 'No points earned in this date range'
		};
	}

	// Group by user
	if (params.groupBy === 'user') {
		const userTotals = new Map<
			string,
			{ name: string; total: number; breakdown: Record<string, number> }
		>();

		for (const t of transactions) {
			const existing = userTotals.get(t.userId) || {
				name: t.userName || 'Unknown',
				total: 0,
				breakdown: {}
			};
			existing.total += t.points;
			existing.breakdown[t.category] = (existing.breakdown[t.category] || 0) + t.points;
			userTotals.set(t.userId, existing);
		}

		const dataPoints: MetricDataPoint[] = Array.from(userTotals.entries())
			.map(([userId, data]) => ({
				label: data.name,
				value: data.total,
				metadata: { userId, breakdown: data.breakdown }
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, params.limit || 10);

		const total = Array.from(userTotals.values()).reduce((sum, u) => sum + u.total, 0);

		return {
			success: true,
			metricType: 'points_earned',
			dateRange: { start: startDateStr, end: endDateStr },
			summary: {
				total,
				average: Math.round(total / userTotals.size),
				min: Math.min(...dataPoints.map((d) => d.value)),
				max: Math.max(...dataPoints.map((d) => d.value)),
				count: userTotals.size
			},
			dataPoints,
			insights: [
				`${total} total points earned by ${userTotals.size} users`,
				dataPoints[0] ? `Top earner: ${dataPoints[0].label} with ${dataPoints[0].value} points` : ''
			].filter(Boolean)
		};
	}

	// Group by category
	const categoryTotals = new Map<string, number>();
	for (const t of transactions) {
		categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + t.points);
	}

	const dataPoints: MetricDataPoint[] = Array.from(categoryTotals.entries())
		.map(([category, total]) => ({
			label: category,
			value: total
		}))
		.sort((a, b) => b.value - a.value);

	const total = transactions.reduce((sum, t) => sum + t.points, 0);

	return {
		success: true,
		metricType: 'points_earned',
		dateRange: { start: startDateStr, end: endDateStr },
		summary: {
			total,
			average: Math.round(total / transactions.length),
			min: Math.min(...transactions.map((t) => t.points)),
			max: Math.max(...transactions.map((t) => t.points)),
			count: transactions.length
		},
		dataPoints,
		insights: [
			`${total} total points from ${transactions.length} transactions`,
			dataPoints[0] ? `Top category: ${dataPoints[0].label} with ${dataPoints[0].value} points` : ''
		].filter(Boolean)
	};
}

export const queryMetricsTool: AITool<QueryMetricsParams, QueryMetricsResult> = {
	name: 'query_metrics',
	description:
		'Query performance metrics for the team. Supports vendor sales, task completion rates, and points earned. Use this to understand trends, compare performance, and generate insights for daily operations.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			metricType: {
				type: 'string',
				enum: ['vendor_sales', 'task_completion_rate', 'points_earned'],
				description:
					'Type of metric to query. Options: vendor_sales (sales by vendor), task_completion_rate (task completion %), points_earned (gamification points)'
			},
			dimensions: {
				type: 'object',
				properties: {
					userId: {
						type: 'string',
						description: 'Filter by specific user ID'
					},
					vendorId: {
						type: 'string',
						description: 'Filter by specific vendor ID'
					}
				},
				description: 'Optional dimension filters'
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
				description: 'Date range for the query. Defaults to last 7 days.'
			},
			groupBy: {
				type: 'string',
				enum: ['day', 'week', 'user', 'vendor'],
				description: 'Dimension to group results by'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of data points to return (default: 10)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,
	rateLimit: {
		maxPerHour: 50
	},

	validate(params: QueryMetricsParams) {
		if (params.dimensions?.userId) {
			const validation = validateUserId(params.dimensions.userId, 'dimensions.userId');
			if (!validation.valid) return validation;
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

		if (params.limit && (params.limit < 1 || params.limit > 100)) {
			return { valid: false, error: 'limit must be between 1 and 100' };
		}

		return { valid: true };
	},

	async execute(
		params: QueryMetricsParams,
		context: ToolExecutionContext
	): Promise<QueryMetricsResult> {
		try {
			const dateRange = getDateRange(params);
			const metricType = params.metricType || 'vendor_sales';

			switch (metricType) {
				case 'vendor_sales':
					return await queryVendorSales(params, dateRange);
				case 'task_completion_rate':
					return await queryTaskCompletionRate(params, dateRange);
				case 'points_earned':
					return await queryPointsEarned(params, dateRange);
				default:
					return {
						success: false,
						error: `Unknown metric type: ${metricType}. Supported types: vendor_sales, task_completion_rate, points_earned`
					};
			}
		} catch (error) {
			log.error({ error }, 'Query metrics tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: QueryMetricsResult): string {
		if (!result.success) {
			return `Failed to query metrics: ${result.error}`;
		}

		if (result.error) {
			return result.error;
		}

		const parts: string[] = [];

		// Header
		parts.push(
			`Metrics: ${result.metricType} (${result.dateRange?.start} to ${result.dateRange?.end})`
		);

		// Summary
		if (result.summary) {
			const s = result.summary;
			parts.push(`\nSummary:`);
			parts.push(`  Total: ${s.total.toLocaleString()}`);
			parts.push(`  Average: ${s.average.toLocaleString()}`);
			parts.push(`  Range: ${s.min.toLocaleString()} - ${s.max.toLocaleString()}`);
			parts.push(`  Count: ${s.count}`);
			if (s.trend) {
				const arrow = s.trend === 'up' ? '+' : s.trend === 'down' ? '-' : '=';
				parts.push(`  Trend: ${arrow} ${s.trend.toUpperCase()} (${s.trendPercentage}%)`);
			}
		}

		// Data points
		if (result.dataPoints && result.dataPoints.length > 0) {
			parts.push(`\nData Points:`);
			for (const dp of result.dataPoints.slice(0, 10)) {
				let line = `  - ${dp.label}: ${dp.value.toLocaleString()}`;
				if (dp.secondaryValue !== undefined) {
					line += ` (${dp.secondaryValue.toLocaleString()})`;
				}
				if (dp.change !== undefined) {
					const changeSign = dp.change >= 0 ? '+' : '';
					line += ` [${changeSign}${dp.change}%]`;
				}
				parts.push(line);
			}
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
