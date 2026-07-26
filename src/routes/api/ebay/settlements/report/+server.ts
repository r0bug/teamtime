import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { settlementReport, periodsAvailable } from '$lib/server/services/ebay-settlement-service';

/**
 * The payroll clerk's view: per-period lister commissions/points and
 * consignor payouts — exactly what gets keyed into NRS (Standards §3:
 * manual keying for now, API export maybe later).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });

	const period = url.searchParams.get('period');
	if (!period) {
		return json({ periods: await periodsAvailable() });
	}
	if (!/^\d{4}-\d{2}$/.test(period)) {
		return json({ error: 'period must be YYYY-MM' }, { status: 400 });
	}
	return json(await settlementReport(period));
};
