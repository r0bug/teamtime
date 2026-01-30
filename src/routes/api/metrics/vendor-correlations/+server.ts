/**
 * Vendor-Employee Correlations API Endpoint
 *
 * Query vendor-employee performance correlations.
 * GET: Query correlations with filters (userId, vendorId, periodType, dateRange)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '$lib/server/logger';
import { isManager } from '$lib/server/auth/roles';
import {
	getVendorTrendsByEmployee,
	getEmployeeTrendsByVendor,
	queryCorrelations
} from '$lib/server/services/vendor-correlation-service';

const log = createLogger('api:metrics:vendor-correlations');

// GET - Query vendor-employee correlations
export const GET: RequestHandler = async ({ locals, url }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Parse query parameters
		const userId = url.searchParams.get('userId');
		const vendorId = url.searchParams.get('vendorId');
		const periodType = url.searchParams.get('periodType') as 'daily' | 'weekly' | 'monthly' | null;
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

		// Validate period type if provided
		if (periodType && !['daily', 'weekly', 'monthly'].includes(periodType)) {
			return json({
				success: false,
				error: 'Invalid periodType. Must be one of: daily, weekly, monthly'
			}, { status: 400 });
		}

		// Non-managers can only view their own correlations
		if (!isManager(locals.user) && userId && userId !== locals.user.id) {
			return json({
				success: false,
				error: 'Forbidden - You can only view your own correlations'
			}, { status: 403 });
		}

		// Build date range
		const dateRange = startDate || endDate
			? {
				start: startDate ? new Date(startDate) : undefined,
				end: endDate ? new Date(endDate) : undefined
			}
			: undefined;

		log.debug({
			userId,
			vendorId,
			periodType,
			dateRange,
			limit,
			requestingUserId: locals.user.id
		}, 'Vendor correlations query request');

		let result;

		// If querying by specific user, use the employee trends function
		if (userId && !vendorId) {
			result = await getVendorTrendsByEmployee(userId, {
				periodType: periodType || undefined,
				dateRange,
				limit
			});
		}
		// If querying by specific vendor, use the vendor trends function
		else if (vendorId && !userId) {
			result = await getEmployeeTrendsByVendor(vendorId, {
				periodType: periodType || undefined,
				dateRange,
				limit
			});
		}
		// Otherwise use the general query
		else {
			result = await queryCorrelations({
				userId: userId || undefined,
				vendorId: vendorId || undefined,
				periodType: periodType || undefined,
				dateRange,
				limit
			});
		}

		return json({
			success: true,
			...result
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Vendor correlations query error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
