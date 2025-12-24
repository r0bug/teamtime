import type { PageServerLoad } from './$types';
import { getLeaderboard, getUserLeaderboardPosition, getOrCreateUserStats, LEVEL_THRESHOLDS } from '$lib/server/services/points-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const period = (url.searchParams.get('period') as 'weekly' | 'monthly') || 'weekly';

	// Get leaderboard
	const leaderboard = await getLeaderboard(period, 20);

	// Get user's position
	const position = await getUserLeaderboardPosition(user.id, period);

	// Get user's stats
	const userStats = await getOrCreateUserStats(user.id);
	const levelInfo = LEVEL_THRESHOLDS.find((l) => l.level === userStats.level) || LEVEL_THRESHOLDS[0];

	return {
		leaderboard,
		userPosition: position?.position || 0,
		totalParticipants: position?.totalParticipants || 0,
		period,
		currentUser: {
			id: user.id,
			name: user.name,
			points: period === 'weekly' ? userStats.weeklyPoints : userStats.monthlyPoints,
			totalPoints: userStats.totalPoints,
			level: userStats.level,
			levelName: levelInfo.name,
			streak: userStats.currentStreak
		}
	};
};
