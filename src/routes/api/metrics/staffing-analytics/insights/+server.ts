/**
 * Staffing Insights Endpoint
 *
 * GET: Get AI-generated staffing insights
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { generateStaffingInsights } from '$lib/server/services/staffing-analytics-service';

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
		const insights = await generateStaffingInsights({
			periodStart,
			periodEnd
		});

		return json({
			success: true,
			periodStart,
			periodEnd,
			count: insights.length,
			insights
		});
	} catch (error) {
		console.error('Staffing insights error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
