// Revenue Optimizer Tool - Get Staffing Insights
// On-demand tool for deeper staffing analysis beyond the context provider summary
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import {
	getTopWorkerPairs,
	getWorkerEfficiency,
	getWorkerImpact,
	getStaffingOptimization,
	getDayOfWeekAnalysis
} from '$lib/server/services/staffing-analytics-service';
import { db, workerPairPerformance } from '$lib/server/db';
import { desc } from 'drizzle-orm';
import { toPacificDateString } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:get-staffing-insights');

type FocusArea = 'pairs' | 'efficiency' | 'impact' | 'staffing' | 'dayOfWeek' | 'all';

interface GetStaffingInsightsParams {
	focusArea: FocusArea;
	daysBack?: number;
}

interface GetStaffingInsightsResult {
	success: boolean;
	focusArea: string;
	periodStart: string;
	periodEnd: string;
	pairs?: Array<{ userName1: string; userName2: string; avgDailySales: number; daysTogether: number }>;
	efficiency?: Array<{ userName: string; salesPerHour: number; totalHours: number; daysWorked: number }>;
	impact?: Array<{ userName: string; salesImpact: number; impactConfidence: number; avgSalesPresent: number; avgSalesAbsent: number }>;
	staffingLevels?: Array<{ workerCount: number; avgDailySales: number; daysObserved: number }>;
	dayOfWeek?: Array<{ dayName: string; avgDailySales: number; avgWorkerCount: number }>;
	error?: string;
}

export const getStaffingInsightsTool: AITool<GetStaffingInsightsParams, GetStaffingInsightsResult> = {
	name: 'get_staffing_insights',
	description: `Analyze staffing patterns for deeper insights beyond what's shown in context. Focus areas:
- pairs: Best performing worker pairs by daily sales
- efficiency: Worker efficiency rankings ($/hour)
- impact: Sales impact when worker present vs absent
- staffing: Optimal staffing levels by worker count
- dayOfWeek: Sales and staffing patterns by day of week
- all: Get a summary of all areas

Use this to dig deeper into staffing optimization opportunities.`,
	agent: 'revenue_optimizer',
	parameters: {
		type: 'object',
		properties: {
			focusArea: {
				type: 'string',
				enum: ['pairs', 'efficiency', 'impact', 'staffing', 'dayOfWeek', 'all'],
				description: 'Which aspect of staffing to analyze'
			},
			daysBack: {
				type: 'number',
				description: 'Number of days to look back for analytics period (default 30)'
			}
		},
		required: ['focusArea']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 10
	},

	validate(params: GetStaffingInsightsParams) {
		const validAreas: FocusArea[] = ['pairs', 'efficiency', 'impact', 'staffing', 'dayOfWeek', 'all'];
		if (!validAreas.includes(params.focusArea)) {
			return { valid: false, error: `Invalid focusArea. Must be one of: ${validAreas.join(', ')}` };
		}
		if (params.daysBack && (params.daysBack < 7 || params.daysBack > 365)) {
			return { valid: false, error: 'daysBack must be between 7 and 365' };
		}
		return { valid: true };
	},

	async execute(params: GetStaffingInsightsParams, context: ToolExecutionContext): Promise<GetStaffingInsightsResult> {
		try {
			// Find the most recent analytics period
			const latestPair = await db
				.select({
					periodStart: workerPairPerformance.periodStart,
					periodEnd: workerPairPerformance.periodEnd
				})
				.from(workerPairPerformance)
				.orderBy(desc(workerPairPerformance.computedAt))
				.limit(1);

			if (latestPair.length === 0) {
				return {
					success: false,
					focusArea: params.focusArea,
					periodStart: '',
					periodEnd: '',
					error: 'No staffing analytics data available. Analytics may not have run yet.'
				};
			}

			const { periodStart, periodEnd } = latestPair[0];
			const result: GetStaffingInsightsResult = {
				success: true,
				focusArea: params.focusArea,
				periodStart,
				periodEnd
			};

			const shouldInclude = (area: FocusArea) =>
				params.focusArea === 'all' || params.focusArea === area;

			if (shouldInclude('pairs')) {
				const pairs = await getTopWorkerPairs({ periodStart, periodEnd, limit: 5 });
				result.pairs = pairs.map(p => ({
					userName1: p.userName1,
					userName2: p.userName2,
					avgDailySales: p.avgDailySales,
					daysTogether: p.daysTogether
				}));
			}

			if (shouldInclude('efficiency')) {
				const eff = await getWorkerEfficiency({ periodStart, periodEnd, limit: 10 });
				result.efficiency = eff.map(e => ({
					userName: e.userName,
					salesPerHour: e.salesPerHour,
					totalHours: e.totalHoursWorked,
					daysWorked: e.daysWorked
				}));
			}

			if (shouldInclude('impact')) {
				const imp = await getWorkerImpact({ periodStart, periodEnd, limit: 10 });
				result.impact = imp.map(i => ({
					userName: i.userName,
					salesImpact: i.salesImpact,
					impactConfidence: i.impactConfidence,
					avgSalesPresent: i.avgSalesWhenPresent,
					avgSalesAbsent: i.avgSalesWhenAbsent
				}));
			}

			if (shouldInclude('staffing')) {
				const levels = await getStaffingOptimization({ periodStart, periodEnd });
				result.staffingLevels = levels.map(l => ({
					workerCount: l.workerCount,
					avgDailySales: l.avgDailySales,
					daysObserved: l.daysObserved
				}));
			}

			if (shouldInclude('dayOfWeek')) {
				const dow = await getDayOfWeekAnalysis({ periodStart, periodEnd });
				result.dayOfWeek = dow.map(d => ({
					dayName: d.dayName,
					avgDailySales: d.avgDailySales,
					avgWorkerCount: d.avgWorkerCount
				}));
			}

			return result;
		} catch (error) {
			log.error({ error }, 'Get staffing insights error');
			return {
				success: false,
				focusArea: params.focusArea,
				periodStart: '',
				periodEnd: '',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetStaffingInsightsResult): string {
		if (!result.success) {
			return `Staffing insights failed: ${result.error}`;
		}

		const lines: string[] = [
			`Staffing Insights (${result.focusArea})`,
			`Period: ${result.periodStart} to ${result.periodEnd}`,
			''
		];

		if (result.pairs && result.pairs.length > 0) {
			lines.push('Best Worker Pairs:');
			for (const p of result.pairs) {
				lines.push(`  ${p.userName1} + ${p.userName2}: $${p.avgDailySales.toFixed(2)}/day (${p.daysTogether} days together)`);
			}
			lines.push('');
		}

		if (result.efficiency && result.efficiency.length > 0) {
			lines.push('Worker Efficiency ($/hour):');
			for (const e of result.efficiency) {
				lines.push(`  ${e.userName}: $${e.salesPerHour.toFixed(2)}/hr (${e.totalHours.toFixed(1)}h, ${e.daysWorked} days)`);
			}
			lines.push('');
		}

		if (result.impact && result.impact.length > 0) {
			lines.push('Worker Impact (present vs absent):');
			for (const i of result.impact) {
				const sign = i.salesImpact >= 0 ? '+' : '';
				lines.push(`  ${i.userName}: ${sign}$${i.salesImpact.toFixed(2)} impact (${Math.round(i.impactConfidence * 100)}% confidence)`);
			}
			lines.push('');
		}

		if (result.staffingLevels && result.staffingLevels.length > 0) {
			lines.push('Staffing Levels:');
			for (const l of result.staffingLevels) {
				lines.push(`  ${l.workerCount} workers: $${l.avgDailySales.toFixed(2)}/day avg (${l.daysObserved} days observed)`);
			}
			lines.push('');
		}

		if (result.dayOfWeek && result.dayOfWeek.length > 0) {
			lines.push('Day of Week Patterns:');
			for (const d of result.dayOfWeek) {
				lines.push(`  ${d.dayName}: $${d.avgDailySales.toFixed(2)}/day, ${d.avgWorkerCount.toFixed(1)} workers avg`);
			}
		}

		return lines.join('\n');
	}
};
