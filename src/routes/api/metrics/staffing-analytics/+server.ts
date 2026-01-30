/**
 * Staffing Analytics Overview Endpoint
 *
 * GET: Get summary of all staffing analytics for a date range
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	getTopWorkerPairs,
	getWorkerEfficiency,
	getWorkerImpact,
	getStaffingOptimization,
	getDayOfWeekAnalysis,
	generateStaffingInsights
} from '$lib/server/services/staffing-analytics-service';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	// Get date range from query params (default 30 days)
	const endDate = new Date();
	const startDate = new Date(endDate);
	startDate.setDate(startDate.getDate() - 30);

	const periodStart = url.searchParams.get('startDate') || startDate.toISOString().split('T')[0];
	const periodEnd = url.searchParams.get('endDate') || endDate.toISOString().split('T')[0];

	try {
		const [pairs, efficiency, impact, staffingLevels, dayOfWeek, insights] = await Promise.all([
			getTopWorkerPairs({ periodStart, periodEnd, limit: 5 }),
			getWorkerEfficiency({ periodStart, periodEnd, limit: 5 }),
			getWorkerImpact({ periodStart, periodEnd, limit: 5 }),
			getStaffingOptimization({ periodStart, periodEnd }),
			getDayOfWeekAnalysis({ periodStart, periodEnd }),
			generateStaffingInsights({ periodStart, periodEnd })
		]);

		return json({
			success: true,
			periodStart,
			periodEnd,
			summary: {
				topPairs: pairs,
				topEfficiency: efficiency,
				topImpact: impact,
				staffingLevels,
				dayOfWeek,
				insights
			}
		});
	} catch (error) {
		console.error('Staffing analytics error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
