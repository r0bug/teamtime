/**
 * Daily mirror of NRS "Associated Pass-Through Vendors" (parent/child payout
 * groups) into vendors.parent_nrs_vendor_id. Reads every vendor's NRS view
 * page (slow — minutes), so it runs from cron, not from a web request:
 *   0 13 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/vendors/pass-through/cron
 * NRS is the source of truth; this only reads. Newly linked children get their
 * portal disabled (the parent's portal acts for them).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';
import { applyNrsChildrenFromWeb } from '$lib/server/services/vendor-service';

const log = createLogger('api:vendors:pass-through:cron');

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
		const result = await applyNrsChildrenFromWeb();
		return json({ ok: true, ...result });
	} catch (err) {
		log.error({ err }, 'NRS pass-through scan failed');
		return json({ error: 'NRS pass-through scan failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = GET;
