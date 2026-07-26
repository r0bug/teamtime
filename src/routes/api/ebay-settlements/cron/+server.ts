/**
 * eBay settlement sync cron — pulls ListFlow's sales feed and (re)computes
 * pending settlements. Safe to run hourly; approved/exported rows are frozen.
 *
 *   0 * * * * curl -H "Authorization: Bearer $CRON_SECRET" .../api/ebay-settlements/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { syncEbaySettlements } from '$lib/server/services/ebay-settlement-service';

export const GET: RequestHandler = async ({ request, url }) => {
	const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');
	if (!apiKey || apiKey !== CRON_SECRET) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const days = Math.min(Number(url.searchParams.get('days')) || 45, 365);
	const result = await syncEbaySettlements(days);
	return json(result);
};
