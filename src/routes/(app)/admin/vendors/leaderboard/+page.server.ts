import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	computeLeaderboard,
	resolvePeriod,
	type LeaderboardMetric,
	type LeaderboardPeriod
} from '$lib/server/services/vendor-leaderboard-service';

const VALID_METRICS: LeaderboardMetric[] = ['gross', 'vendorPortion', 'retained'];
const VALID_PERIODS: LeaderboardPeriod[] = ['7d', '30d', 'mtd', 'ytd', 'custom'];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const periodParam = url.searchParams.get('period');
	const metricParam = url.searchParams.get('metric');
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');

	const period: LeaderboardPeriod = VALID_PERIODS.includes(periodParam as LeaderboardPeriod)
		? (periodParam as LeaderboardPeriod)
		: '30d';
	const metric: LeaderboardMetric = VALID_METRICS.includes(metricParam as LeaderboardMetric)
		? (metricParam as LeaderboardMetric)
		: 'gross';

	const range = resolvePeriod(period, startParam ?? undefined, endParam ?? undefined);

	const result = await computeLeaderboard({
		startDate: range.start,
		endDate: range.end,
		metric,
		includePriorPeriod: true
	});

	return { result, period, metric, range };
};
