// eBay listing-agent commissions (from ListFlow) — lives beside payroll so
// commission payouts get handled in the same workflow as hours.
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	getPayPeriodConfig,
	getCurrentPayPeriod,
	listRecentPayPeriods
} from '$lib/server/services/pay-period-service';
import { getCommissionPayroll } from '$lib/server/services/listflow-client';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const config = await getPayPeriodConfig();
	const periods = listRecentPayPeriods(config, 8);
	const current = getCurrentPayPeriod(config);

	// ?period=<index into periods>, "all" for all-time; default = current period
	const periodParam = url.searchParams.get('period') ?? '';
	let selectedIndex: number | 'all' = 'all';
	let from: string | undefined;
	let to: string | undefined;

	if (periodParam !== 'all') {
		const idx = parseInt(periodParam, 10);
		const chosen =
			Number.isInteger(idx) && idx >= 0 && idx < periods.length
				? periods[idx]
				: (current ?? periods[0]);
		selectedIndex = periods.findIndex((p) => p.startDate.getTime() === chosen.startDate.getTime());
		from = chosen.startDate.toISOString();
		to = chosen.endDate.toISOString();
	}

	const agents = await getCommissionPayroll(from, to);

	return {
		available: agents !== null,
		agents: agents ?? [],
		periods: periods.map((p, i) => ({ index: i, label: p.label, isCurrent: p.isCurrent })),
		selectedIndex,
		totals: {
			commission: (agents ?? []).reduce((sum, a) => sum + a.totalCommission, 0),
			unpaid: (agents ?? []).reduce((sum, a) => sum + a.unpaid, 0),
			salesCount: (agents ?? []).reduce((sum, a) => sum + a.salesCount, 0)
		}
	};
};
