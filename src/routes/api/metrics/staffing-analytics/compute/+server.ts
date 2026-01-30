/**
 * Staffing Analytics Compute Endpoint
 *
 * POST: Trigger computation of staffing analytics for a date range
 * Requires CRON_SECRET for authentication
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { isManager } from '$lib/server/auth/roles';
import { computeAllStaffingAnalytics } from '$lib/server/services/staffing-analytics-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:staffing-analytics:compute');

// Simple secret-based auth for cron jobs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET || 'teamtime-cron-secret';

	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also check query param for simple curl testing
	const url = new URL(request.url);
	if (url.searchParams.get('secret') === cronSecret) {
		return true;
	}

	return false;
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
	// Allow either cron secret or manager auth
	if (!validateCronRequest(request) && !isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Get date range from request body or query params
	let startDate: Date;
	let endDate: Date;

	try {
		const body = await request.json().catch(() => ({}));

		const startStr = body.startDate || url.searchParams.get('startDate');
		const endStr = body.endDate || url.searchParams.get('endDate');

		if (startStr && endStr) {
			startDate = new Date(startStr + 'T00:00:00');
			endDate = new Date(endStr + 'T23:59:59');
		} else {
			// Default to last 90 days
			endDate = new Date();
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - 90);
		}
	} catch {
		// Default to last 90 days
		endDate = new Date();
		startDate = new Date(endDate);
		startDate.setDate(startDate.getDate() - 90);
	}

	log.info({ startDate, endDate }, 'Computing staffing analytics');

	try {
		const result = await computeAllStaffingAnalytics(startDate, endDate);

		log.info({ result }, 'Staffing analytics computation completed');

		return json({
			success: true,
			...result
		});
	} catch (error) {
		log.error({ error }, 'Staffing analytics computation failed');
		return json({
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// Allow GET for simpler testing
export const GET: RequestHandler = async (event) => {
	return POST(event);
};
