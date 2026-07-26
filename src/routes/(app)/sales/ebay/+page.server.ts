// eBay sales (from ListFlow) — read-only mirror under the sales dashboard
import type { PageServerLoad } from './$types';
import { getEbaySalesFeed } from '$lib/server/services/listflow-client';

const ALLOWED_RANGE_DAYS = [7, 14, 30, 60, 90, 180, 365] as const;
const DEFAULT_RANGE_DAYS = 30;

export const load: PageServerLoad = async ({ url }) => {
	const daysParam = parseInt(url.searchParams.get('days') ?? '', 10);
	const rangeDays: number = ALLOWED_RANGE_DAYS.includes(
		daysParam as (typeof ALLOWED_RANGE_DAYS)[number]
	)
		? daysParam
		: DEFAULT_RANGE_DAYS;
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const from = new Date();
	from.setDate(from.getDate() - rangeDays);

	const feed = await getEbaySalesFeed({ from: from.toISOString(), page, limit: 50 });

	const sales = feed?.sales ?? [];
	const totals = {
		count: feed?.pagination.total ?? 0,
		gross: sales.reduce((sum, s) => sum + s.totalPrice, 0),
		commissions: sales.reduce((sum, s) => sum + (s.commission?.amount ?? 0), 0)
	};

	return {
		available: feed !== null,
		rangeDays,
		page,
		pagination: feed?.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
		sales,
		totals
	};
};
