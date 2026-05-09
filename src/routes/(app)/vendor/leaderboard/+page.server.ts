import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
	computeLeaderboard,
	resolvePeriod,
	type LeaderboardPeriod
} from '$lib/server/services/vendor-leaderboard-service';
import {
	getDailyWinners,
	getBestSellingItems,
	getMostItemsInOneDay,
	getLongestStreak,
	getHotBooth
} from '$lib/server/services/vendor-stats-service';

const ALLOWED_PERIODS: LeaderboardPeriod[] = ['7d', '30d', 'mtd'];

export const load: PageServerLoad = async ({ parent, url }) => {
	const { vendor } = await parent();
	if (!vendor) throw redirect(302, '/login');

	const periodParam = url.searchParams.get('period');
	const period: LeaderboardPeriod = (ALLOWED_PERIODS as string[]).includes(periodParam ?? '')
		? (periodParam as LeaderboardPeriod)
		: '30d';

	const range = resolvePeriod(period);

	// Run independent reads in parallel for snappier first paint.
	const [leaderboard, hotBooth, dailyWinners, bestItems, mostItemsDay, streaks] = await Promise.all([
		computeLeaderboard({
			startDate: range.start,
			endDate: range.end,
			metric: 'vendorPortion',
			includePriorPeriod: true,
			limit: 10
		}),
		getHotBooth({ startDate: range.start, endDate: range.end }),
		getDailyWinners(7),
		getBestSellingItems({ startDate: range.start, endDate: range.end, limit: 10 }),
		getMostItemsInOneDay({ startDate: range.start, endDate: range.end }),
		getLongestStreak({ startDate: range.start, endDate: range.end })
	]);

	return {
		period,
		range,
		leaderboard,
		hotBooth,
		dailyWinners,
		bestItems,
		mostItemsDay,
		streaks
	};
};
