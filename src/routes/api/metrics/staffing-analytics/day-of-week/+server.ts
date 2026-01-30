/**
 * Day of Week Patterns Endpoint
 *
 * GET: Get day of week sales patterns
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getDayOfWeekAnalysis } from '$lib/server/services/staffing-analytics-service';

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
		const days = await getDayOfWeekAnalysis({
			periodStart,
			periodEnd
		});

		return json({
			success: true,
			periodStart,
			periodEnd,
			count: days.length,
			days
		});
	} catch (error) {
		console.error('Day of week error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
