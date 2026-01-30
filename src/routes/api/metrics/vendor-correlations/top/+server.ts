/**
 * Top Vendor-Employee Correlations API Endpoint
 *
 * Get the strongest positive or negative correlations between employees and vendors.
 * GET: Top correlations with filters (positive/negative, minShifts, minHours, limit)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '$lib/server/logger';
import { isManager } from '$lib/server/auth/roles';
import { getTopCorrelations } from '$lib/server/services/vendor-correlation-service';

const log = createLogger('api:metrics:vendor-correlations:top');

// GET - Get top correlations
export const GET: RequestHandler = async ({ locals, url }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	// Manager/admin access only for top correlations (contains performance insights)
	if (!isManager(locals.user)) {
		return json({
			success: false,
			error: 'Forbidden - Manager access required'
		}, { status: 403 });
	}

	try {
		// Parse query parameters
		const positive = url.searchParams.get('positive');
		const minShifts = url.searchParams.get('minShifts');
		const minHours = url.searchParams.get('minHours');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
		const periodType = url.searchParams.get('periodType') as 'daily' | 'weekly' | 'monthly' | null;

		// Validate period type if provided
		if (periodType && !['daily', 'weekly', 'monthly'].includes(periodType)) {
			return json({
				success: false,
				error: 'Invalid periodType. Must be one of: daily, weekly, monthly'
			}, { status: 400 });
		}

		// Parse boolean for positive (default: true = strongest positive correlations)
		const isPositive = positive !== 'false';

		log.debug({
			positive: isPositive,
			minShifts,
			minHours,
			periodType,
			limit,
			userId: locals.user.id
		}, 'Top correlations query request');

		const result = await getTopCorrelations({
			positive: isPositive,
			minShifts: minShifts ? parseInt(minShifts, 10) : undefined,
			minHours: minHours ? parseFloat(minHours) : undefined,
			periodType: periodType || 'weekly',
			limit
		});

		return json({
			success: true,
			filterApplied: {
				positive: isPositive,
				minShifts: minShifts ? parseInt(minShifts, 10) : null,
				minHours: minHours ? parseFloat(minHours) : null,
				periodType: periodType || 'weekly'
			},
			...result
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Top correlations query error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
