/**
 * Vendor Newsletter Cron Endpoint
 *
 * Sends any draft newsletter whose scheduled_send_at has passed (and stages
 * next month's draft for recurring ones). Idempotent — due drafts are
 * atomically claimed, so overlapping runs can't double-send.
 *
 * Call hourly via external cron:
 * 12 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/vendor-newsletters/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { processDueNewsletters } from '$lib/server/services/vendor-newsletter-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:vendor-newsletters:cron');

// Simple secret-based auth for cron jobs (same pattern as points/cron).
// SECURITY: Only accepts Authorization header - query params can leak in logs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	if (!CRON_SECRET || CRON_SECRET === 'teamtime-cron-secret') {
		if (process.env.NODE_ENV !== 'production') {
			log.warn('CRON_SECRET not configured - allowing unauthenticated access in development');
			return true;
		}
		log.error('CRON_SECRET environment variable must be set in production');
		return false;
	}
	return authHeader === `Bearer ${CRON_SECRET}`;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const { processed, results } = await processDueNewsletters();
		if (processed.length) log.info({ processed, results }, 'Scheduled newsletters sent');
		return json({ ok: true, processed, results });
	} catch (err) {
		log.error({ err }, 'Newsletter cron failed');
		return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
