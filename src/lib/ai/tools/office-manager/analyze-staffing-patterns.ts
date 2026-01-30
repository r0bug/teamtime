/**
 * @module AI/Tools/AnalyzeStaffingPatterns
 * @description AI tool for analyzing employee scheduling patterns.
 *
 * Provides insights on:
 * - Best worker pairs (who works well together)
 * - Individual worker efficiency ($/hour)
 * - Worker impact (sales when present vs absent)
 * - Optimal staffing levels
 * - Day of week patterns
 *
 * Use cases:
 * - "Who should I schedule together for best sales?"
 * - "Which employees have the highest sales per hour?"
 * - "What's our best day of the week for sales?"
 * - "How many workers should we have on shift?"
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 */
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import {
	getTopWorkerPairs,
	getWorkerEfficiency,
	getWorkerImpact,
	getStaffingOptimization,
	getDayOfWeekAnalysis,
	generateStaffingInsights
} from '$lib/server/services/staffing-analytics-service';

const log = createLogger('ai:tools:analyze-staffing-patterns');

interface AnalyzeStaffingPatternsParams {
	startDate?: string;  // YYYY-MM-DD
	endDate?: string;
	focusArea?: 'pairs' | 'efficiency' | 'impact' | 'staffing' | 'dayOfWeek' | 'all';
	userId?: string;     // Focus on specific user
	limit?: number;
}

interface AnalyzeStaffingPatternsResult {
	success: boolean;
	periodStart?: string;
	periodEnd?: string;
	focusArea?: string;
	pairs?: Array<{
		userName1: string;
		userName2: string;
		daysTogether: number;
		avgDailySales: number;
	}>;
	efficiency?: Array<{
		userName: string;
		salesPerHour: number;
		totalHoursWorked: number;
	}>;
	impact?: Array<{
		userName: string;
		avgSalesWhenPresent: number;
		avgSalesWhenAbsent: number;
		salesImpact: number;
		impactConfidence: number;
	}>;
	staffingLevels?: Array<{
		workerCount: number;
		avgDailySales: number;
		daysObserved: number;
	}>;
	dayOfWeek?: Array<{
		dayName: string;
		avgDailySales: number;
		avgWorkerCount: number;
	}>;
	insights?: string[];
	error?: string;
}

// Helper to get date range defaults
function getDateRange(params: AnalyzeStaffingPatternsParams): { start: string; end: string } {
	const now = new Date();
	const end = params.endDate || now.toISOString().split('T')[0];

	const defaultStart = new Date(now);
	defaultStart.setDate(defaultStart.getDate() - 30);
	const start = params.startDate || defaultStart.toISOString().split('T')[0];

	return { start, end };
}

export const analyzeStaffingPatternsTool: AITool<
	AnalyzeStaffingPatternsParams,
	AnalyzeStaffingPatternsResult
> = {
	name: 'analyze_staffing_patterns',
	description:
		'Analyze employee scheduling patterns to find best worker combinations, individual efficiency metrics, and optimal staffing levels. Useful for making data-driven scheduling decisions.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			startDate: {
				type: 'string',
				description: 'Start date in YYYY-MM-DD format. Defaults to 30 days ago.'
			},
			endDate: {
				type: 'string',
				description: 'End date in YYYY-MM-DD format. Defaults to today.'
			},
			focusArea: {
				type: 'string',
				enum: ['pairs', 'efficiency', 'impact', 'staffing', 'dayOfWeek', 'all'],
				description: 'Area to focus analysis on. Default: all'
			},
			userId: {
				type: 'string',
				description: 'Focus analysis on a specific user (UUID)'
			},
			limit: {
				type: 'number',
				description: 'Number of results to return per category (default: 5)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,
	rateLimit: {
		maxPerHour: 30
	},

	validate(params: AnalyzeStaffingPatternsParams) {
		if (params.userId) {
			const validation = validateUserId(params.userId, 'userId');
			if (!validation.valid) return validation;
		}

		if (params.limit && (params.limit < 1 || params.limit > 50)) {
			return { valid: false, error: 'limit must be between 1 and 50' };
		}

		if (params.startDate) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.startDate)) {
				return { valid: false, error: 'startDate must be in YYYY-MM-DD format' };
			}
		}

		if (params.endDate) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.endDate)) {
				return { valid: false, error: 'endDate must be in YYYY-MM-DD format' };
			}
		}

		return { valid: true };
	},

	async execute(
		params: AnalyzeStaffingPatternsParams,
		context: ToolExecutionContext
	): Promise<AnalyzeStaffingPatternsResult> {
		try {
			const dateRange = getDateRange(params);
			const limit = params.limit || 5;
			const focusArea = params.focusArea || 'all';

			const result: AnalyzeStaffingPatternsResult = {
				success: true,
				periodStart: dateRange.start,
				periodEnd: dateRange.end,
				focusArea
			};

			// Fetch data based on focus area
			if (focusArea === 'all' || focusArea === 'pairs') {
				const pairs = await getTopWorkerPairs({
					periodStart: dateRange.start,
					periodEnd: dateRange.end,
					limit
				});
				result.pairs = pairs.map(p => ({
					userName1: p.userName1,
					userName2: p.userName2,
					daysTogether: p.daysTogether,
					avgDailySales: p.avgDailySales
				}));
			}

			if (focusArea === 'all' || focusArea === 'efficiency') {
				const efficiency = await getWorkerEfficiency({
					periodStart: dateRange.start,
					periodEnd: dateRange.end,
					limit
				});
				result.efficiency = efficiency.map(e => ({
					userName: e.userName,
					salesPerHour: e.salesPerHour,
					totalHoursWorked: e.totalHoursWorked
				}));
			}

			if (focusArea === 'all' || focusArea === 'impact') {
				const impact = await getWorkerImpact({
					periodStart: dateRange.start,
					periodEnd: dateRange.end,
					limit
				});
				result.impact = impact.map(i => ({
					userName: i.userName,
					avgSalesWhenPresent: i.avgSalesWhenPresent,
					avgSalesWhenAbsent: i.avgSalesWhenAbsent,
					salesImpact: i.salesImpact,
					impactConfidence: i.impactConfidence
				}));
			}

			if (focusArea === 'all' || focusArea === 'staffing') {
				const levels = await getStaffingOptimization({
					periodStart: dateRange.start,
					periodEnd: dateRange.end
				});
				result.staffingLevels = levels.map(l => ({
					workerCount: l.workerCount,
					avgDailySales: l.avgDailySales,
					daysObserved: l.daysObserved
				}));
			}

			if (focusArea === 'all' || focusArea === 'dayOfWeek') {
				const days = await getDayOfWeekAnalysis({
					periodStart: dateRange.start,
					periodEnd: dateRange.end
				});
				result.dayOfWeek = days.map(d => ({
					dayName: d.dayName,
					avgDailySales: d.avgDailySales,
					avgWorkerCount: d.avgWorkerCount
				}));
			}

			// Always get insights
			const insights = await generateStaffingInsights({
				periodStart: dateRange.start,
				periodEnd: dateRange.end
			});
			result.insights = insights.map(i => i.message);

			return result;
		} catch (error) {
			log.error({ error }, 'Analyze staffing patterns tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: AnalyzeStaffingPatternsResult): string {
		if (!result.success) {
			return `Failed to analyze staffing patterns: ${result.error}`;
		}

		const parts: string[] = [];

		// Header
		parts.push(
			`Staffing Pattern Analysis (${result.periodStart} to ${result.periodEnd})`
		);

		// Insights first
		if (result.insights && result.insights.length > 0) {
			parts.push(`\nKey Insights:`);
			for (const insight of result.insights) {
				parts.push(`  * ${insight}`);
			}
		}

		// Worker pairs
		if (result.pairs && result.pairs.length > 0) {
			parts.push(`\nBest Worker Pairs:`);
			for (let i = 0; i < result.pairs.length; i++) {
				const p = result.pairs[i];
				parts.push(`  ${i + 1}. ${p.userName1} + ${p.userName2}: $${p.avgDailySales.toFixed(2)}/day (${p.daysTogether} days together)`);
			}
		}

		// Efficiency
		if (result.efficiency && result.efficiency.length > 0) {
			parts.push(`\nWorker Efficiency ($/hour):`);
			for (let i = 0; i < result.efficiency.length; i++) {
				const e = result.efficiency[i];
				parts.push(`  ${i + 1}. ${e.userName}: $${e.salesPerHour.toFixed(2)}/hr (${e.totalHoursWorked.toFixed(1)}h total)`);
			}
		}

		// Impact
		if (result.impact && result.impact.length > 0) {
			parts.push(`\nWorker Impact (sales when present vs absent):`);
			for (const i of result.impact) {
				const sign = i.salesImpact >= 0 ? '+' : '';
				const conf = Math.round(i.impactConfidence * 100);
				parts.push(`  - ${i.userName}: ${sign}$${i.salesImpact.toFixed(2)} impact (${conf}% confidence)`);
			}
		}

		// Staffing levels
		if (result.staffingLevels && result.staffingLevels.length > 0) {
			parts.push(`\nStaffing Level Analysis:`);
			const optimal = [...result.staffingLevels].sort((a, b) => b.avgDailySales - a.avgDailySales)[0];
			for (const l of result.staffingLevels) {
				const isOptimal = l.workerCount === optimal.workerCount ? ' [OPTIMAL]' : '';
				parts.push(`  - ${l.workerCount} workers: $${l.avgDailySales.toFixed(2)}/day avg (${l.daysObserved} days observed)${isOptimal}`);
			}
		}

		// Day of week
		if (result.dayOfWeek && result.dayOfWeek.length > 0) {
			parts.push(`\nDay of Week Patterns:`);
			const best = [...result.dayOfWeek].sort((a, b) => b.avgDailySales - a.avgDailySales)[0];
			for (const d of result.dayOfWeek) {
				const isBest = d.dayName === best.dayName ? ' [BEST]' : '';
				parts.push(`  - ${d.dayName}: $${d.avgDailySales.toFixed(2)}/day avg (${d.avgWorkerCount.toFixed(1)} workers avg)${isBest}`);
			}
		}

		if (parts.length === 1) {
			parts.push('\nNo staffing analytics data available. Data needs to be computed first.');
		}

		return parts.join('\n');
	}
};
