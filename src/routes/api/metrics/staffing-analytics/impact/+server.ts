/**
 * Worker Impact Endpoint
 *
 * GET: Get worker impact analysis (sales when present vs absent)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getWorkerImpact } from '$lib/server/services/staffing-analytics-service';

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
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const minDaysWorked = parseInt(url.searchParams.get('minDaysWorked') || '5', 10);

	try {
		const workers = await getWorkerImpact({
			periodStart,
			periodEnd,
			limit,
			minDaysWorked
		});

		return json({
			success: true,
			periodStart,
			periodEnd,
			count: workers.length,
			workers
		});
	} catch (error) {
		console.error('Worker impact error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
