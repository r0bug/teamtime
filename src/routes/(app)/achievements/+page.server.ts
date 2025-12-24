import type { PageServerLoad } from './$types';
import { getAllAchievementsWithProgress, getAchievementStats } from '$lib/server/services/achievements-service';
import { getOrCreateUserStats, LEVEL_THRESHOLDS } from '$lib/server/services/points-service';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	const achievements = await getAllAchievementsWithProgress(user.id);
	const stats = await getAchievementStats(user.id);
	const userStats = await getOrCreateUserStats(user.id);
	const levelInfo = LEVEL_THRESHOLDS.find((l) => l.level === userStats.level) || LEVEL_THRESHOLDS[0];

	// Group by category
	const byCategory: Record<string, typeof achievements> = {};
	for (const achievement of achievements) {
		if (!byCategory[achievement.category]) {
			byCategory[achievement.category] = [];
		}
		byCategory[achievement.category].push(achievement);
	}

	return {
		achievements,
		byCategory,
		stats,
		userStats: {
			level: userStats.level,
			levelName: levelInfo.name,
			totalPoints: userStats.totalPoints,
			currentStreak: userStats.currentStreak,
			longestStreak: userStats.longestStreak
		}
	};
};
