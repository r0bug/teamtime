import type { PageServerLoad } from './$types';
import { getAllAchievementsWithProgress, getAchievementStats } from '$lib/server/services/achievements-service';
import { getOrCreateUserStats, LEVEL_THRESHOLDS } from '$lib/server/services/points-service';
import { db, pricingGrades, pricingDecisions } from '$lib/server/db';
import { eq, sql, desc } from 'drizzle-orm';

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

	// Fetch pricing grades for this user
	const pricingGradesData = await db
		.select({
			id: pricingGrades.id,
			overallGrade: pricingGrades.overallGrade,
			priceAccuracy: pricingGrades.priceAccuracy,
			justificationQuality: pricingGrades.justificationQuality,
			photoQuality: pricingGrades.photoQuality,
			pointsAwarded: pricingGrades.pointsAwarded,
			feedback: pricingGrades.feedback,
			gradedAt: pricingGrades.gradedAt,
			itemDescription: pricingDecisions.itemDescription,
			pricingDecisionId: pricingGrades.pricingDecisionId
		})
		.from(pricingGrades)
		.innerJoin(pricingDecisions, eq(pricingGrades.pricingDecisionId, pricingDecisions.id))
		.where(eq(pricingDecisions.userId, user.id))
		.orderBy(desc(pricingGrades.gradedAt))
		.limit(10);

	// Calculate pricing stats
	const pricingStats = {
		totalGraded: pricingGradesData.length,
		averageGrade: 0,
		totalPoints: 0,
		excellent: 0,
		good: 0,
		acceptable: 0,
		needsImprovement: 0,
		avgPriceAccuracy: 0,
		avgJustificationQuality: 0,
		avgPhotoQuality: 0
	};

	if (pricingGradesData.length > 0) {
		let totalGrade = 0;
		let totalPriceAcc = 0;
		let totalJustQual = 0;
		let totalPhotoQual = 0;

		for (const grade of pricingGradesData) {
			const gradeNum = parseFloat(grade.overallGrade);
			totalGrade += gradeNum;
			totalPriceAcc += grade.priceAccuracy;
			totalJustQual += grade.justificationQuality;
			totalPhotoQual += grade.photoQuality;
			pricingStats.totalPoints += grade.pointsAwarded;

			if (gradeNum >= 4.5) pricingStats.excellent++;
			else if (gradeNum >= 3.5) pricingStats.good++;
			else if (gradeNum >= 2.5) pricingStats.acceptable++;
			else pricingStats.needsImprovement++;
		}

		pricingStats.averageGrade = Math.round((totalGrade / pricingGradesData.length) * 100) / 100;
		pricingStats.avgPriceAccuracy = Math.round((totalPriceAcc / pricingGradesData.length) * 10) / 10;
		pricingStats.avgJustificationQuality = Math.round((totalJustQual / pricingGradesData.length) * 10) / 10;
		pricingStats.avgPhotoQuality = Math.round((totalPhotoQual / pricingGradesData.length) * 10) / 10;
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
		},
		pricingStats,
		recentGrades: pricingGradesData.slice(0, 5)
	};
};
