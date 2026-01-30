/**
 * Worker Efficiency Endpoint
 *
 * GET: Get worker efficiency rankings ($/hour)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getWorkerEfficiency } from '$lib/server/services/staffing-analytics-service';

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
	const minHours = parseInt(url.searchParams.get('minHours') || '10', 10);

	try {
		const workers = await getWorkerEfficiency({
			periodStart,
			periodEnd,
			limit,
			minHours
		});

		return json({
			success: true,
			periodStart,
			periodEnd,
			count: workers.length,
			workers
		});
	} catch (error) {
		console.error('Worker efficiency error:', error);
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
