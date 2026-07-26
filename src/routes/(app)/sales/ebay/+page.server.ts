// eBay sales (from ListFlow) — read-only mirror under the sales dashboard.
// Contract v2: the feed carries sku/location, attribution + lister, and
// consignment tags; money math lives in TeamTime's settlements.
import type { PageServerLoad } from './$types';
import { getEbaySalesFeed } from '$lib/server/services/listflow-client';

const ALLOWED_RANGE_DAYS = [7, 14, 30, 60, 90, 180, 365] as const;
const DEFAULT_RANGE_DAYS = 30;
const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const daysParam = parseInt(url.searchParams.get('days') ?? '', 10);
	const rangeDays: number = ALLOWED_RANGE_DAYS.includes(
		daysParam as (typeof ALLOWED_RANGE_DAYS)[number]
	)
		? daysParam
		: DEFAULT_RANGE_DAYS;
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const feed = await getEbaySalesFeed(rangeDays);
	const all = feed?.sales ?? [];
	const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
	const sales = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const totals = {
		count: all.length,
		gross: all.reduce((sum, s) => sum + s.itemPrice * s.quantity, 0),
		attributed: all.filter((s) => s.attributionStatus === 'ATTRIBUTED').length
	};

	return {
		available: feed !== null,
		rangeDays,
		page,
		pagination: { page, limit: PAGE_SIZE, total: all.length, pages },
		sales,
		totals
	};
};
