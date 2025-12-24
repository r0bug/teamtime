/**
 * Achievements Service
 *
 * Handles achievement checking, awarding, and notifications.
 * Achievements are badges earned for specific accomplishments.
 */

import {
	db,
	achievements,
	userAchievements,
	userStats
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import type { Achievement, UserAchievement, UserStats, AchievementCriteria } from '$lib/server/db/schema';
import { awardPoints, getOrCreateUserStats } from './points-service';

const log = createLogger('services:achievements');

// ============================================================================
// DEFAULT ACHIEVEMENTS
// ============================================================================

export const DEFAULT_ACHIEVEMENTS: Omit<Achievement, 'id' | 'createdAt'>[] = [
	// Attendance Achievements
	{
		code: 'FIRST_CLOCK',
		name: 'First Day',
		description: 'Complete your first clock-in',
		category: 'attendance',
		tier: 'bronze',
		icon: '🎯',
		pointReward: 25,
		criteria: { type: 'count', field: 'attendancePoints', value: 1 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'STREAK_7',
		name: 'Week Warrior',
		description: 'Maintain a 7-day streak',
		category: 'attendance',
		tier: 'bronze',
		icon: '🔥',
		pointReward: 100,
		criteria: { type: 'streak', value: 7 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'STREAK_30',
		name: 'Monthly Master',
		description: 'Maintain a 30-day streak',
		category: 'attendance',
		tier: 'silver',
		icon: '⭐',
		pointReward: 500,
		criteria: { type: 'streak', value: 30 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'STREAK_90',
		name: 'Quarter Champion',
		description: 'Maintain a 90-day streak',
		category: 'attendance',
		tier: 'gold',
		icon: '🏆',
		pointReward: 1500,
		criteria: { type: 'streak', value: 90 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'EARLY_BIRD',
		name: 'Early Bird',
		description: 'Clock in early 10 times',
		category: 'attendance',
		tier: 'bronze',
		icon: '🌅',
		pointReward: 50,
		criteria: { type: 'cumulative', field: 'earlyArrivals', value: 10 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},

	// Task Achievements
	{
		code: 'TASK_10',
		name: 'Getting Started',
		description: 'Complete 10 tasks',
		category: 'task',
		tier: 'bronze',
		icon: '✅',
		pointReward: 50,
		criteria: { type: 'count', field: 'tasksCompleted', value: 10 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'TASK_50',
		name: 'Task Tackler',
		description: 'Complete 50 tasks',
		category: 'task',
		tier: 'silver',
		icon: '💪',
		pointReward: 250,
		criteria: { type: 'count', field: 'tasksCompleted', value: 50 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'TASK_100',
		name: 'Century Club',
		description: 'Complete 100 tasks',
		category: 'task',
		tier: 'gold',
		icon: '💯',
		pointReward: 500,
		criteria: { type: 'count', field: 'tasksCompleted', value: 100 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'TASK_RUSH',
		name: 'Speed Demon',
		description: 'Complete 5 tasks before their due date',
		category: 'task',
		tier: 'bronze',
		icon: '⚡',
		pointReward: 75,
		criteria: { type: 'count', field: 'tasksOnTime', value: 5 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},

	// Pricing Achievements
	{
		code: 'FIRST_PRICE',
		name: 'Price Tagger',
		description: 'Submit your first pricing decision',
		category: 'pricing',
		tier: 'bronze',
		icon: '🏷️',
		pointReward: 25,
		criteria: { type: 'count', field: 'pricingDecisions', value: 1 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'PRICE_50',
		name: 'Pricing Pro',
		description: 'Submit 50 pricing decisions',
		category: 'pricing',
		tier: 'silver',
		icon: '📊',
		pointReward: 250,
		criteria: { type: 'count', field: 'pricingDecisions', value: 50 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'PRICING_MASTER',
		name: 'Pricing Master',
		description: 'Maintain an average grade above 4.5 with 100+ decisions',
		category: 'pricing',
		tier: 'platinum',
		icon: '👑',
		pointReward: 1000,
		criteria: { type: 'threshold', field: 'avgPricingGrade', value: 4.5 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},

	// Sales Achievements
	{
		code: 'FIRST_SALE',
		name: 'First Sale',
		description: 'Work a shift with $100+ retained',
		category: 'sales',
		tier: 'bronze',
		icon: '💵',
		pointReward: 25,
		criteria: { type: 'threshold', field: 'salesPoints', value: 5 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'BIG_DAY',
		name: 'Big Day',
		description: 'Earn 50+ sales points in a single day',
		category: 'sales',
		tier: 'silver',
		icon: '🎉',
		pointReward: 150,
		criteria: { type: 'threshold', field: 'dailySales', value: 50 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},

	// Level Achievements
	{
		code: 'LEVEL_5',
		name: 'Rising Star',
		description: 'Reach level 5',
		category: 'achievement',
		tier: 'silver',
		icon: '⭐',
		pointReward: 250,
		criteria: { type: 'count', field: 'level', value: 5 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},
	{
		code: 'LEVEL_10',
		name: 'Champion',
		description: 'Reach level 10',
		category: 'achievement',
		tier: 'platinum',
		icon: '🏆',
		pointReward: 2500,
		criteria: { type: 'count', field: 'level', value: 10 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	},

	// Special Achievements
	{
		code: 'ALL_ROUNDER',
		name: 'All-Rounder',
		description: 'Earn 1000+ points in each category',
		category: 'achievement',
		tier: 'gold',
		icon: '🌟',
		pointReward: 750,
		criteria: { type: 'cumulative', field: 'allCategories', value: 1000 } as AchievementCriteria,
		isSecret: false,
		isActive: true
	}
];

// ============================================================================
// SEEDING
// ============================================================================

/**
 * Seed default achievements into the database
 */
export async function seedAchievements(): Promise<{ created: number; existing: number }> {
	let created = 0;
	let existing = 0;

	for (const achievement of DEFAULT_ACHIEVEMENTS) {
		const [exists] = await db
			.select()
			.from(achievements)
			.where(eq(achievements.code, achievement.code))
			.limit(1);

		if (exists) {
			existing++;
		} else {
			await db.insert(achievements).values(achievement);
			created++;
		}
	}

	log.info({ created, existing }, 'Achievement seeding complete');
	return { created, existing };
}

// ============================================================================
// CHECKING & AWARDING
// ============================================================================

/**
 * Check if a user has earned an achievement
 */
function checkAchievementCriteria(
	achievement: Achievement,
	stats: UserStats,
	additionalContext?: Record<string, number>
): boolean {
	const criteria = achievement.criteria as AchievementCriteria;

	switch (criteria.type) {
		case 'streak':
			return stats.currentStreak >= criteria.value || stats.longestStreak >= criteria.value;

		case 'count':
			if (!criteria.field) return false;
			const countValue = (stats as Record<string, unknown>)[criteria.field];
			if (typeof countValue === 'number') {
				return countValue >= criteria.value;
			}
			return false;

		case 'threshold':
			if (!criteria.field) return false;
			const thresholdValue = (stats as Record<string, unknown>)[criteria.field];
			if (criteria.field === 'avgPricingGrade') {
				// Also check that they have enough decisions
				if (stats.pricingDecisions < 100) return false;
			}
			if (typeof thresholdValue === 'number' || typeof thresholdValue === 'string') {
				return Number(thresholdValue) >= criteria.value;
			}
			return false;

		case 'cumulative':
			if (criteria.field === 'allCategories') {
				// Special case: all categories must have 1000+ points
				return (
					stats.attendancePoints >= criteria.value &&
					stats.taskPoints >= criteria.value &&
					stats.pricingPoints >= criteria.value &&
					stats.salesPoints >= criteria.value
				);
			}
			if (additionalContext && criteria.field && criteria.field in additionalContext) {
				return additionalContext[criteria.field] >= criteria.value;
			}
			return false;

		default:
			return false;
	}
}

/**
 * Check and award any newly earned achievements for a user
 */
export async function checkAndAwardAchievements(
	userId: string,
	additionalContext?: Record<string, number>
): Promise<Achievement[]> {
	const earnedAchievements: Achievement[] = [];

	// Get user's stats
	const stats = await getOrCreateUserStats(userId);

	// Get all active achievements
	const allAchievements = await db
		.select()
		.from(achievements)
		.where(eq(achievements.isActive, true));

	// Get user's already earned achievements
	const alreadyEarned = await db
		.select({ achievementId: userAchievements.achievementId })
		.from(userAchievements)
		.where(eq(userAchievements.userId, userId));

	const earnedIds = new Set(alreadyEarned.map((a) => a.achievementId));

	for (const achievement of allAchievements) {
		// Skip if already earned
		if (earnedIds.has(achievement.id)) continue;

		// Check if criteria is met
		if (checkAchievementCriteria(achievement, stats, additionalContext)) {
			// Award the achievement
			await db.insert(userAchievements).values({
				userId,
				achievementId: achievement.id
			});

			// Award bonus points
			if (achievement.pointReward > 0) {
				await awardPoints({
					userId,
					basePoints: achievement.pointReward,
					category: 'achievement',
					action: `achievement_${achievement.code.toLowerCase()}`,
					description: `Earned achievement: ${achievement.name}`,
					metadata: { achievementCode: achievement.code, achievementTier: achievement.tier }
				});
			}

			earnedAchievements.push(achievement);

			log.info(
				{
					userId,
					achievementCode: achievement.code,
					achievementName: achievement.name,
					pointReward: achievement.pointReward
				},
				'Achievement earned'
			);
		}
	}

	return earnedAchievements;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all achievements with user's progress
 */
export async function getAllAchievementsWithProgress(userId: string): Promise<
	(Achievement & {
		earned: boolean;
		earnedAt: Date | null;
	})[]
> {
	const allAchievements = await db
		.select()
		.from(achievements)
		.where(eq(achievements.isActive, true))
		.orderBy(achievements.category, achievements.tier);

	const userEarned = await db
		.select()
		.from(userAchievements)
		.where(eq(userAchievements.userId, userId));

	const earnedMap = new Map(userEarned.map((ua) => [ua.achievementId, ua.earnedAt]));

	return allAchievements.map((achievement) => ({
		...achievement,
		earned: earnedMap.has(achievement.id),
		earnedAt: earnedMap.get(achievement.id) ?? null
	}));
}

/**
 * Get user's earned achievements
 */
export async function getUserAchievements(userId: string): Promise<
	(UserAchievement & { achievement: Achievement })[]
> {
	const results = await db
		.select()
		.from(userAchievements)
		.innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
		.where(eq(userAchievements.userId, userId))
		.orderBy(desc(userAchievements.earnedAt));

	return results.map((r) => ({
		...r.user_achievements,
		achievement: r.achievements
	}));
}

/**
 * Get user's recent achievements (for dashboard)
 */
export async function getRecentAchievements(
	userId: string,
	limit: number = 5
): Promise<Achievement[]> {
	const results = await db
		.select({ achievement: achievements })
		.from(userAchievements)
		.innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
		.where(eq(userAchievements.userId, userId))
		.orderBy(desc(userAchievements.earnedAt))
		.limit(limit);

	return results.map((r) => r.achievement);
}

/**
 * Get unnotified achievements for a user
 */
export async function getUnnotifiedAchievements(userId: string): Promise<
	(UserAchievement & { achievement: Achievement })[]
> {
	const results = await db
		.select()
		.from(userAchievements)
		.innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
		.where(
			and(
				eq(userAchievements.userId, userId),
				isNull(userAchievements.notifiedAt)
			)
		);

	return results.map((r) => ({
		...r.user_achievements,
		achievement: r.achievements
	}));
}

/**
 * Mark achievements as notified
 */
export async function markAchievementsNotified(achievementIds: string[]): Promise<void> {
	if (achievementIds.length === 0) return;

	await db
		.update(userAchievements)
		.set({ notifiedAt: new Date() })
		.where(sql`${userAchievements.id} = ANY(${achievementIds})`);
}

/**
 * Get achievement by code
 */
export async function getAchievementByCode(code: string): Promise<Achievement | null> {
	const [achievement] = await db
		.select()
		.from(achievements)
		.where(eq(achievements.code, code))
		.limit(1);

	return achievement ?? null;
}

/**
 * Get achievement counts by tier
 */
export async function getAchievementStats(userId: string): Promise<{
	total: number;
	earned: number;
	bronze: { total: number; earned: number };
	silver: { total: number; earned: number };
	gold: { total: number; earned: number };
	platinum: { total: number; earned: number };
}> {
	const allAchievements = await db.select().from(achievements).where(eq(achievements.isActive, true));
	const userEarned = await db.select().from(userAchievements).where(eq(userAchievements.userId, userId));

	const earnedIds = new Set(userEarned.map((ua) => ua.achievementId));

	const stats = {
		total: allAchievements.length,
		earned: userEarned.length,
		bronze: { total: 0, earned: 0 },
		silver: { total: 0, earned: 0 },
		gold: { total: 0, earned: 0 },
		platinum: { total: 0, earned: 0 }
	};

	for (const achievement of allAchievements) {
		const tier = achievement.tier as 'bronze' | 'silver' | 'gold' | 'platinum';
		stats[tier].total++;
		if (earnedIds.has(achievement.id)) {
			stats[tier].earned++;
		}
	}

	return stats;
}
