/**
 * Booth archive cron: upsert this month's floorplan_booth_history rows
 * (space, rent, commission per booth) so the revenue calculator keeps an
 * accurate month-by-month record even when nobody edits the floorplan.
 * Call daily via external cron:
 *   0 14 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/floorplan/booth-history/cron
 * Unlike /api/floorplan/cron this does NOT run the vendor sync / notifications.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';
import { captureBoothHistory } from '$lib/server/floorplan/booth-history';

const log = createLogger('api:floorplan:booth-history:cron');

function validateCronRequest(request: Request): boolean {
	const cronSecret = CRON_SECRET;
	if (!cronSecret || cronSecret === 'teamtime-cron-secret') {
		if (process.env.NODE_ENV !== 'production') {
			log.warn('CRON_SECRET not configured - allowing unauthenticated access in development');
			return true;
		}
		log.error('CRON_SECRET environment variable must be set in production');
		return false;
	}
	return request.headers.get('Authorization') === `Bearer ${cronSecret}` || request.headers.get('X-Cron-Secret') === cronSecret;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!validateCronRequest(request)) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const result = await captureBoothHistory('cron');
		return json({ ok: true, ...result });
	} catch (err) {
		log.error({ err }, 'Booth history capture failed');
		return json({ error: 'Booth history capture failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = GET;
