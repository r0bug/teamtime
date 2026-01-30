/**
 * Worker Pairs Endpoint
 *
 * GET: Get top performing worker pairs
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getTopWorkerPairs } from '$lib/server/services/staffing-analytics-service';

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
	const limit = parseInt(url.searchParams.get('limit') || '10', 10);
	const minDays = parseInt(url.searchParams.get('minDays') || '2', 10);
	const orderBy = (url.searchParams.get('orderBy') || 'avgDailySales') as 'avgDailySales' | 'daysTogether' | 'totalSales';

	try {
		const pairs = await getTopWorkerPairs({
			periodStart,
			periodEnd,
			limit,
			minDays,
			orderBy
		});

		return json({
			success: true,
			periodStart,
			periodEnd,
			count: pairs.length,
			pairs
		});
	} catch (error) {
		console.error('Worker pairs error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
