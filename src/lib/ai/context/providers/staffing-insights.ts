// Staffing Insights Context Provider - Pre-computed staffing analytics for AI agents
import { db, workerPairPerformance } from '$lib/server/db';
import { desc } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import { generateStaffingInsights } from '$lib/server/services/staffing-analytics-service';
import { getTopCorrelations } from '$lib/server/services/vendor-correlation-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:context:staffing-insights');

interface StaffingInsightsContextData {
	insights: Array<{
		type: string;
		priority: string;
		message: string;
	}>;
	vendorCorrelations: Array<{
		userName: string;
		vendorName: string;
		salesDeltaPct: number;
		confidenceScore: number;
	}>;
	periodStart: string;
	periodEnd: string;
	isStale: boolean;
	summary: {
		totalInsights: number;
		hasStaffingData: number;
	};
}

export const staffingInsightsProvider: AIContextProvider<StaffingInsightsContextData> = {
	moduleId: 'staffing_insights',
	moduleName: 'Staffing Insights',
	description: 'Pre-computed staffing analytics: best pairs, worker impact, optimal levels, day patterns',
	priority: 28, // After tasks (25), before locations (30)
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		// Check if any analytics data exists
		const rows = await db
			.select({ id: workerPairPerformance.id })
			.from(workerPairPerformance)
			.limit(1);
		return rows.length > 0;
	},

	async getContext(): Promise<StaffingInsightsContextData> {
		// Find the most recent analytics period
		const latestPair = await db
			.select({
				periodStart: workerPairPerformance.periodStart,
				periodEnd: workerPairPerformance.periodEnd,
				computedAt: workerPairPerformance.computedAt
			})
			.from(workerPairPerformance)
			.orderBy(desc(workerPairPerformance.computedAt))
			.limit(1);

		if (latestPair.length === 0) {
			return {
				insights: [],
				vendorCorrelations: [],
				periodStart: '',
				periodEnd: '',
				isStale: false,
				summary: { totalInsights: 0, hasStaffingData: 0 }
			};
		}

		const { periodStart, periodEnd, computedAt } = latestPair[0];

		// Check staleness (>14 days old)
		const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		const isStale = computedAt ? new Date(computedAt) < fourteenDaysAgo : false;

		// Get staffing insights from existing service
		let insights: StaffingInsightsContextData['insights'] = [];
		try {
			const rawInsights = await generateStaffingInsights({ periodStart, periodEnd });
			insights = rawInsights.map(i => ({
				type: i.type,
				priority: i.priority,
				message: i.message
			}));
		} catch (error) {
			log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'Failed to generate staffing insights');
		}

		// Get top 3 vendor-employee correlations
		let vendorCorrelations: StaffingInsightsContextData['vendorCorrelations'] = [];
		try {
			const topCorr = await getTopCorrelations({
				positive: true,
				minShifts: 3,
				periodType: 'weekly',
				limit: 3
			});
			vendorCorrelations = topCorr.map(c => ({
				userName: c.userName,
				vendorName: c.vendorName,
				salesDeltaPct: Math.round(c.salesDeltaPct * 10) / 10,
				confidenceScore: Math.round(c.confidenceScore * 100) / 100
			}));
		} catch (error) {
			log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'Failed to get vendor correlations');
		}

		return {
			insights,
			vendorCorrelations,
			periodStart,
			periodEnd,
			isStale,
			summary: {
				totalInsights: insights.length,
				hasStaffingData: insights.length > 0 ? 1 : 0
			}
		};
	},

	estimateTokens(context: StaffingInsightsContextData): number {
		// ~40 base + ~25 per insight + ~20 per correlation
		return 40 + context.insights.length * 25 + context.vendorCorrelations.length * 20;
	},

	formatForPrompt(context: StaffingInsightsContextData): string {
		const lines: string[] = ['## Staffing Insights'];

		if (context.insights.length === 0 && context.vendorCorrelations.length === 0) {
			lines.push('No staffing analytics data available.');
			return lines.join('\n');
		}

		if (context.isStale) {
			lines.push(`*Note: Data is >14 days old (period: ${context.periodStart} to ${context.periodEnd}). Insights may be outdated.*`);
			lines.push('');
		} else {
			lines.push(`Period: ${context.periodStart} to ${context.periodEnd}`);
			lines.push('');
		}

		// Group insights by priority
		const highPriority = context.insights.filter(i => i.priority === 'high');
		const mediumPriority = context.insights.filter(i => i.priority === 'medium');
		const lowPriority = context.insights.filter(i => i.priority === 'low');

		if (highPriority.length > 0) {
			for (const i of highPriority) {
				lines.push(`- **${i.message}**`);
			}
		}

		if (mediumPriority.length > 0) {
			for (const i of mediumPriority) {
				lines.push(`- ${i.message}`);
			}
		}

		if (lowPriority.length > 0) {
			for (const i of lowPriority) {
				lines.push(`- ${i.message}`);
			}
		}

		// Vendor correlations
		if (context.vendorCorrelations.length > 0) {
			lines.push('');
			lines.push('### Vendor-Staff Correlations');
			for (const c of context.vendorCorrelations) {
				const sign = c.salesDeltaPct >= 0 ? '+' : '';
				lines.push(`- ${c.userName} → ${c.vendorName}: ${sign}${c.salesDeltaPct}% sales delta (${Math.round(c.confidenceScore * 100)}% confidence)`);
			}
		}

		return lines.join('\n');
	}
};
