/**
 * Floorplan Sync Cron Endpoint
 *
 * Runs the flag-only floorplan/vendor reconciliation (spec §5). Call daily
 * (or after vendor syncs) via external cron:
 *   0 7 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/floorplan/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';
import { runFloorplanSync } from '$lib/server/floorplan/sync';

const log = createLogger('api:floorplan:cron');

// Simple secret-based auth for cron jobs
// SECURITY: Only accepts Authorization header - query params can leak in logs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET;

	// Require a proper secret to be configured
	if (!cronSecret || cronSecret === 'teamtime-cron-secret') {
		// In development, allow requests without auth if no secret is configured
		if (process.env.NODE_ENV !== 'production') {
			log.warn('CRON_SECRET not configured - allowing unauthenticated access in development');
			return true;
		}
		log.error('CRON_SECRET environment variable must be set in production');
		return false;
	}

	// Validate Bearer token
	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also accept X-Cron-Secret header for services that don't support Bearer auth
	const cronSecretHeader = request.headers.get('X-Cron-Secret');
	if (cronSecretHeader === cronSecret) {
		return true;
	}

	return false;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const result = await runFloorplanSync();
		return json({ ok: true, ...result });
	} catch (err) {
		log.error({ err }, 'Floorplan sync failed');
		return json({ error: 'Floorplan sync failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = GET;
