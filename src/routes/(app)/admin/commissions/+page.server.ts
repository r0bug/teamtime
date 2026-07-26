// eBay settlement report — lives beside payroll so eBay payouts get handled
// in the same workflow as hours. TeamTime now OWNS the money math (fleet
// Standards §3): consignor cut / YF cut / lister commission-or-points are
// computed locally from ListFlow's sales feed (ebay-settlement-service).
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	settlementReport,
	periodsAvailable
} from '$lib/server/services/ebay-settlement-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const periods = await periodsAvailable();
	const requested = url.searchParams.get('period') ?? '';
	const period = /^\d{4}-\d{2}$/.test(requested)
		? requested
		: (periods[0] ?? new Date().toISOString().slice(0, 7));

	const report = await settlementReport(period);

	return {
		periods,
		period,
		report,
		isAdmin: locals.user?.role === 'admin'
	};
};
