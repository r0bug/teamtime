/**
 * Points Service
 *
 * Handles all gamification point calculations, awards, and user stats management.
 * Uses game theory principles for employee motivation:
 * - Variable rewards based on action quality
 * - Streak tracking with multipliers (loss aversion)
 * - Level progression
 * - Achievement unlocks
 */

import {
	db,
	pointTransactions,
	userStats,
	users,
	shifts,
	timeEntries
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, sql, gte, lte, desc } from 'drizzle-orm';
import type { NewPointTransaction, UserStats, PointTransaction } from '$lib/server/db/schema';
import { getPacificDateParts, getPacificStartOfDay } from '$lib/server/utils/timezone';

const log = createLogger('services:points');

// ============================================================================
// POINT VALUES CONFIGURATION
// ============================================================================

export const POINT_VALUES = {
	// Attendance
	CLOCK_IN_ON_TIME: 10, // Within 5 min of scheduled shift
	CLOCK_IN_EARLY: 15, // 5-30 min before shift
	CLOCK_IN_LATE_PER_5MIN: -5, // Per 5 min late (max -20)
	CLOCK_IN_LATE_MAX: -20,
	CLOCK_OUT_PROPER: 5, // Normal clock out
	CLOCK_OUT_FORGOTTEN: -15, // Required admin fix

	// Tasks
	TASK_COMPLETE: 20, // Base completion
	TASK_COMPLETE_EARLY: 10, // Before due date
	TASK_COMPLETE_ON_TIME: 5, // By due date
	TASK_COMPLETE_LATE: -10, // After due date
	TASK_COMPLETE_WITH_PHOTOS: 5, // When required
	TASK_COMPLETE_WITH_NOTES: 5, // When required
	TASK_CANCELLED_MISSED: -20, // countsAsMissed = true

	// Pricing
	PRICING_SUBMIT: 10, // Base for any pricing
	PRICING_GRADE_EXCELLENT: 25, // 4.5-5.0
	PRICING_GRADE_GOOD: 15, // 3.5-4.4
	PRICING_GRADE_ACCEPTABLE: 5, // 2.5-3.4
	PRICING_GRADE_POOR: -10, // 1.0-2.4

	// Sales
	SALES_PER_100_RETAINED: 5, // Per $100 retained during shift
	SALES_BEAT_AVERAGE: 20, // Sales/hour > your avg
	SALES_TOP_SELLER: 50 // #1 of the day
};

// Streak multipliers
export const STREAK_MULTIPLIERS: { [key: number]: number } = {
	0: 1.0,
	1: 1.0,
	2: 1.0,
	3: 1.1,
	4: 1.1,
	5: 1.2,
	6: 1.2,
	7: 1.3, // Also awards streak bonus
	14: 1.4, // Also awards streak bonus
	30: 1.5 // Also awards streak bonus
};

// Streak bonus points at milestones
export const STREAK_BONUSES: { [key: number]: number } = {
	3: 10,
	5: 25,
	7: 50,
	14: 100,
	30: 250
};

// Level thresholds
export const LEVEL_THRESHOLDS = [
	{ level: 1, minPoints: 0, name: 'Newcomer' },
	{ level: 2, minPoints: 500, name: 'Trainee' },
	{ level: 3, minPoints: 1500, name: 'Team Member' },
	{ level: 4, minPoints: 3500, name: 'Reliable' },
	{ level: 5, minPoints: 7000, name: 'Veteran' },
	{ level: 6, minPoints: 12000, name: 'Expert' },
	{ level: 7, minPoints: 20000, name: 'Master' },
	{ level: 8, minPoints: 35000, name: 'Elite' },
	{ level: 9, minPoints: 60000, name: 'Legend' },
	{ level: 10, minPoints: 100000, name: 'Champion' }
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get or create user stats record
 */
export async function getOrCreateUserStats(userId: string): Promise<UserStats> {
	const [existing] = await db.select().from(userStats).where(eq(userStats.userId, userId));

	if (existing) {
		return existing;
	}

	// Create new stats record
	const [newStats] = await db
		.insert(userStats)
		.values({
			userId,
			totalPoints: 0,
			weeklyPoints: 0,
			monthlyPoints: 0,
			level: 1,
			levelProgress: 0,
			currentStreak: 0,
			longestStreak: 0,
			attendancePoints: 0,
			taskPoints: 0,
			pricingPoints: 0,
			salesPoints: 0,
			tasksCompleted: 0,
			tasksOnTime: 0,
			pricingDecisions: 0
		})
		.returning();

	return newStats;
}

/**
 * Get streak multiplier based on current streak
 */
export function getStreakMultiplier(streak: number): number {
	const thresholds = Object.keys(STREAK_MULTIPLIERS)
		.map(Number)
		.sort((a, b) => b - a);
	for (const threshold of thresholds) {
		if (streak >= threshold) {
			return STREAK_MULTIPLIERS[threshold];
		}
	}
	return 1.0;
}

/**
 * Calculate level from total points
 */
export function calculateLevel(totalPoints: number): { level: number; name: string; progress: number; nextLevelPoints: number } {
	let currentLevel = LEVEL_THRESHOLDS[0];
	let nextLevel = LEVEL_THRESHOLDS[1];

	for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
		if (totalPoints >= LEVEL_THRESHOLDS[i].minPoints) {
			currentLevel = LEVEL_THRESHOLDS[i];
			nextLevel = LEVEL_THRESHOLDS[i + 1] || currentLevel;
		}
	}

	const pointsInLevel = totalPoints - currentLevel.minPoints;
	const pointsNeeded = nextLevel.minPoints - currentLevel.minPoints;
	const progress = pointsNeeded > 0 ? Math.min(100, Math.floor((pointsInLevel / pointsNeeded) * 100)) : 100;

	return {
		level: currentLevel.level,
		name: currentLevel.name,
		progress,
		nextLevelPoints: nextLevel.minPoints
	};
}

/**
 * Award points to a user
 */
export async function awardPoints(params: {
	userId: string;
	basePoints: number;
	category: 'attendance' | 'task' | 'pricing' | 'sales' | 'bonus' | 'achievement';
	action: string;
	description?: string;
	sourceType?: string;
	sourceId?: string;
	metadata?: Record<string, unknown>;
	applyStreakMultiplier?: boolean;
}): Promise<{ transaction: PointTransaction; newTotal: number; levelUp: boolean }> {
	const stats = await getOrCreateUserStats(params.userId);

	// Calculate multiplier
	let multiplier = 1.0;
	if (params.applyStreakMultiplier && params.category === 'attendance') {
		multiplier = getStreakMultiplier(stats.currentStreak);
	}

	const finalPoints = Math.round(params.basePoints * multiplier);

	// Insert transaction
	const [transaction] = await db
		.insert(pointTransactions)
		.values({
			userId: params.userId,
			points: finalPoints,
			basePoints: params.basePoints,
			multiplier: String(multiplier),
			category: params.category,
			action: params.action,
			description: params.description,
			sourceType: params.sourceType,
			sourceId: params.sourceId,
			metadata: params.metadata
		})
		.returning();

	// Update user stats
	const previousLevel = stats.level;
	const newTotal = stats.totalPoints + finalPoints;
	const { level: newLevel, progress } = calculateLevel(newTotal);

	// Build update object
	const updateObj: Record<string, unknown> = {
		totalPoints: sql`${userStats.totalPoints} + ${finalPoints}`,
		weeklyPoints: sql`${userStats.weeklyPoints} + ${finalPoints}`,
		monthlyPoints: sql`${userStats.monthlyPoints} + ${finalPoints}`,
		level: newLevel,
		levelProgress: progress,
		updatedAt: new Date()
	};

	// Update category-specific points
	switch (params.category) {
		case 'attendance':
			updateObj.attendancePoints = sql`${userStats.attendancePoints} + ${finalPoints}`;
			break;
		case 'task':
			updateObj.taskPoints = sql`${userStats.taskPoints} + ${finalPoints}`;
			break;
		case 'pricing':
			updateObj.pricingPoints = sql`${userStats.pricingPoints} + ${finalPoints}`;
			break;
		case 'sales':
			updateObj.salesPoints = sql`${userStats.salesPoints} + ${finalPoints}`;
			break;
	}

	await db.update(userStats).set(updateObj).where(eq(userStats.userId, params.userId));

	log.info(
		{
			userId: params.userId,
			action: params.action,
			basePoints: params.basePoints,
			multiplier,
			finalPoints,
			newTotal
		},
		'Points awarded'
	);

	return {
		transaction,
		newTotal,
		levelUp: newLevel > previousLevel
	};
}

// ============================================================================
// ATTENDANCE POINTS
// ============================================================================

/**
 * Award points for clock-in based on timeliness
 */
export async function awardClockInPoints(
	userId: string,
	timeEntryId: string,
	clockInTime: Date
): Promise<{ points: number; action: string }> {
	// Find scheduled shift for this clock-in
	const pacificDate = getPacificDateParts(clockInTime);
	const dayStart = getPacificStartOfDay(clockInTime);
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

	const [shift] = await db
		.select()
		.from(shifts)
		.where(
			and(
				eq(shifts.userId, userId),
				gte(shifts.startTime, dayStart),
				lte(shifts.startTime, dayEnd)
			)
		)
		.limit(1);

	let points = POINT_VALUES.CLOCK_IN_ON_TIME;
	let action = 'clock_in_on_time';
	let description = 'Clocked in on time';

	if (shift) {
		const shiftStart = new Date(shift.startTime);
		const diffMinutes = (clockInTime.getTime() - shiftStart.getTime()) / (1000 * 60);

		if (diffMinutes < -30) {
			// Very early (more than 30 min before) - treat as on time
			points = POINT_VALUES.CLOCK_IN_ON_TIME;
			action = 'clock_in_on_time';
			description = 'Clocked in on time';
		} else if (diffMinutes < -5) {
			// Early (5-30 min before)
			points = POINT_VALUES.CLOCK_IN_EARLY;
			action = 'clock_in_early';
			description = `Clocked in ${Math.abs(Math.round(diffMinutes))} minutes early`;
		} else if (diffMinutes <= 5) {
			// On time (within 5 min)
			points = POINT_VALUES.CLOCK_IN_ON_TIME;
			action = 'clock_in_on_time';
			description = 'Clocked in on time';
		} else {
			// Late
			const lateMinutes = Math.ceil(diffMinutes / 5) * 5; // Round up to nearest 5
			points = Math.max(POINT_VALUES.CLOCK_IN_LATE_MAX, POINT_VALUES.CLOCK_IN_LATE_PER_5MIN * Math.ceil(lateMinutes / 5));
			action = 'clock_in_late';
			description = `Clocked in ${Math.round(diffMinutes)} minutes late`;
		}
	}

	// Update streak on clock-in
	await updateStreak(userId, action !== 'clock_in_late');

	await awardPoints({
		userId,
		basePoints: points,
		category: 'attendance',
		action,
		description,
		sourceType: 'time_entry',
		sourceId: timeEntryId,
		applyStreakMultiplier: true
	});

	return { points, action };
}

/**
 * Award points for clock-out
 */
export async function awardClockOutPoints(
	userId: string,
	timeEntryId: string,
	wasNormal: boolean
): Promise<{ points: number; action: string }> {
	const points = wasNormal ? POINT_VALUES.CLOCK_OUT_PROPER : POINT_VALUES.CLOCK_OUT_FORGOTTEN;
	const action = wasNormal ? 'clock_out_proper' : 'clock_out_forgotten';
	const description = wasNormal ? 'Clocked out properly' : 'Forgot to clock out (admin fixed)';

	await awardPoints({
		userId,
		basePoints: points,
		category: 'attendance',
		action,
		description,
		sourceType: 'time_entry',
		sourceId: timeEntryId
	});

	return { points, action };
}

// ============================================================================
// STREAK MANAGEMENT
// ============================================================================

/**
 * Update user's streak based on performance
 */
export async function updateStreak(userId: string, goodDay: boolean): Promise<number> {
	const stats = await getOrCreateUserStats(userId);
	const today = getPacificDateParts(new Date());
	const todayStr = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;

	// Check if we already processed today
	if (stats.lastStreakDate === todayStr) {
		return stats.currentStreak;
	}

	let newStreak = stats.currentStreak;

	if (goodDay) {
		// Check if this continues the streak (yesterday or last work day)
		const lastStreakDate = stats.lastStreakDate;
		let continuingStreak = false;

		if (lastStreakDate) {
			const lastDate = new Date(lastStreakDate);
			const diffDays = Math.floor((new Date(todayStr).getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

			// Allow up to 3 days gap (for weekends/days off)
			if (diffDays <= 3) {
				continuingStreak = true;
			}
		}

		if (continuingStreak) {
			newStreak = stats.currentStreak + 1;
		} else {
			newStreak = 1; // Start new streak
		}

		// Check for streak milestone bonuses
		if (STREAK_BONUSES[newStreak]) {
			await awardPoints({
				userId,
				basePoints: STREAK_BONUSES[newStreak],
				category: 'bonus',
				action: `streak_milestone_${newStreak}`,
				description: `Achieved ${newStreak}-day streak!`,
				metadata: { streakDays: newStreak }
			});

			log.info({ userId, streak: newStreak, bonus: STREAK_BONUSES[newStreak] }, 'Streak milestone bonus awarded');
		}
	} else {
		// Bad day - reset streak
		newStreak = 0;
		log.info({ userId, previousStreak: stats.currentStreak }, 'Streak reset due to poor performance');
	}

	// Update stats
	await db
		.update(userStats)
		.set({
			currentStreak: newStreak,
			longestStreak: Math.max(stats.longestStreak, newStreak),
			lastStreakDate: todayStr,
			updatedAt: new Date()
		})
		.where(eq(userStats.userId, userId));

	return newStreak;
}

// ============================================================================
// TASK POINTS
// ============================================================================

/**
 * Award points for task completion
 */
export async function awardTaskPoints(params: {
	userId: string;
	taskId: string;
	dueAt?: Date | null;
	completedAt: Date;
	photoRequired: boolean;
	notesRequired: boolean;
	hasPhotos: boolean;
	hasNotes: boolean;
	wasCancelled?: boolean;
	countsAsMissed?: boolean;
}): Promise<{ points: number; breakdown: Record<string, number> }> {
	const breakdown: Record<string, number> = {};

	// Handle cancelled/missed tasks
	if (params.wasCancelled && params.countsAsMissed) {
		await awardPoints({
			userId: params.userId,
			basePoints: POINT_VALUES.TASK_CANCELLED_MISSED,
			category: 'task',
			action: 'task_missed',
			description: 'Task marked as missed',
			sourceType: 'task',
			sourceId: params.taskId
		});

		// Reset streak for missed task
		await updateStreak(params.userId, false);

		return { points: POINT_VALUES.TASK_CANCELLED_MISSED, breakdown: { missed: POINT_VALUES.TASK_CANCELLED_MISSED } };
	}

	// Base completion points
	let totalPoints = POINT_VALUES.TASK_COMPLETE;
	breakdown.completion = POINT_VALUES.TASK_COMPLETE;

	// Timeliness bonus/penalty
	if (params.dueAt) {
		const dueTime = new Date(params.dueAt).getTime();
		const completedTime = params.completedAt.getTime();

		if (completedTime < dueTime) {
			// Early
			totalPoints += POINT_VALUES.TASK_COMPLETE_EARLY;
			breakdown.early = POINT_VALUES.TASK_COMPLETE_EARLY;
		} else if (completedTime <= dueTime + 60 * 60 * 1000) {
			// On time (within 1 hour of due)
			totalPoints += POINT_VALUES.TASK_COMPLETE_ON_TIME;
			breakdown.onTime = POINT_VALUES.TASK_COMPLETE_ON_TIME;
		} else {
			// Late
			totalPoints += POINT_VALUES.TASK_COMPLETE_LATE;
			breakdown.late = POINT_VALUES.TASK_COMPLETE_LATE;
		}
	}

	// Photo bonus
	if (params.photoRequired && params.hasPhotos) {
		totalPoints += POINT_VALUES.TASK_COMPLETE_WITH_PHOTOS;
		breakdown.photos = POINT_VALUES.TASK_COMPLETE_WITH_PHOTOS;
	}

	// Notes bonus
	if (params.notesRequired && params.hasNotes) {
		totalPoints += POINT_VALUES.TASK_COMPLETE_WITH_NOTES;
		breakdown.notes = POINT_VALUES.TASK_COMPLETE_WITH_NOTES;
	}

	await awardPoints({
		userId: params.userId,
		basePoints: totalPoints,
		category: 'task',
		action: 'task_completed',
		description: `Task completed${breakdown.early ? ' early' : breakdown.late ? ' late' : ' on time'}`,
		sourceType: 'task',
		sourceId: params.taskId,
		metadata: breakdown
	});

	// Update task metrics
	await db
		.update(userStats)
		.set({
			tasksCompleted: sql`${userStats.tasksCompleted} + 1`,
			tasksOnTime: breakdown.early || breakdown.onTime
				? sql`${userStats.tasksOnTime} + 1`
				: sql`${userStats.tasksOnTime}`,
			updatedAt: new Date()
		})
		.where(eq(userStats.userId, params.userId));

	return { points: totalPoints, breakdown };
}

// ============================================================================
// PRICING POINTS
// ============================================================================

/**
 * Award points for pricing decision submission
 */
export async function awardPricingSubmitPoints(
	userId: string,
	pricingDecisionId: string
): Promise<{ points: number }> {
	await awardPoints({
		userId,
		basePoints: POINT_VALUES.PRICING_SUBMIT,
		category: 'pricing',
		action: 'pricing_submit',
		description: 'Submitted pricing decision',
		sourceType: 'pricing_decision',
		sourceId: pricingDecisionId
	});

	// Update pricing decision count
	await db
		.update(userStats)
		.set({
			pricingDecisions: sql`${userStats.pricingDecisions} + 1`,
			updatedAt: new Date()
		})
		.where(eq(userStats.userId, userId));

	return { points: POINT_VALUES.PRICING_SUBMIT };
}

/**
 * Award points based on pricing grade
 */
export async function awardPricingGradePoints(
	userId: string,
	pricingDecisionId: string,
	overallGrade: number
): Promise<{ points: number; tier: string }> {
	let points: number;
	let tier: string;

	if (overallGrade >= 4.5) {
		points = POINT_VALUES.PRICING_GRADE_EXCELLENT;
		tier = 'excellent';
	} else if (overallGrade >= 3.5) {
		points = POINT_VALUES.PRICING_GRADE_GOOD;
		tier = 'good';
	} else if (overallGrade >= 2.5) {
		points = POINT_VALUES.PRICING_GRADE_ACCEPTABLE;
		tier = 'acceptable';
	} else {
		points = POINT_VALUES.PRICING_GRADE_POOR;
		tier = 'poor';
	}

	await awardPoints({
		userId,
		basePoints: points,
		category: 'pricing',
		action: `pricing_grade_${tier}`,
		description: `Pricing graded as ${tier} (${overallGrade.toFixed(1)})`,
		sourceType: 'pricing_decision',
		sourceId: pricingDecisionId,
		metadata: { grade: overallGrade, tier }
	});

	// Update average pricing grade
	const stats = await getOrCreateUserStats(userId);
	const currentAvg = Number(stats.avgPricingGrade) || 0;
	const count = stats.pricingDecisions || 1;
	const newAvg = ((currentAvg * (count - 1)) + overallGrade) / count;

	await db
		.update(userStats)
		.set({
			avgPricingGrade: String(newAvg.toFixed(2)),
			updatedAt: new Date()
		})
		.where(eq(userStats.userId, userId));

	return { points, tier };
}

// ============================================================================
// SALES POINTS
// ============================================================================

/**
 * Award points based on sales during shift
 */
export async function awardSalesPoints(
	userId: string,
	date: string,
	attributedRetained: number,
	hoursWorked: number,
	isTopSeller: boolean
): Promise<{ points: number; breakdown: Record<string, number> }> {
	const breakdown: Record<string, number> = {};

	// Points per $100 retained
	const retainedPoints = Math.floor(attributedRetained / 100) * POINT_VALUES.SALES_PER_100_RETAINED;
	breakdown.retained = retainedPoints;

	let totalPoints = retainedPoints;

	// Check if beat personal average
	const stats = await getOrCreateUserStats(userId);
	const currentAvg = stats.salesPoints > 0 && stats.tasksCompleted > 0
		? stats.salesPoints / stats.tasksCompleted // Rough approximation
		: 0;
	const todayRate = attributedRetained / Math.max(hoursWorked, 1);

	// Top seller bonus
	if (isTopSeller) {
		totalPoints += POINT_VALUES.SALES_TOP_SELLER;
		breakdown.topSeller = POINT_VALUES.SALES_TOP_SELLER;
	}

	if (totalPoints > 0) {
		await awardPoints({
			userId,
			basePoints: totalPoints,
			category: 'sales',
			action: 'sales_daily',
			description: `Sales attribution for ${date}`,
			sourceType: 'sales_snapshot',
			metadata: {
				date,
				attributedRetained,
				hoursWorked,
				isTopSeller,
				breakdown
			}
		});
	}

	return { points: totalPoints, breakdown };
}

// ============================================================================
// LEADERBOARD & STATS QUERIES
// ============================================================================

/**
 * Get leaderboard for a given period
 */
export async function getLeaderboard(
	period: 'daily' | 'weekly' | 'monthly',
	limit: number = 10
): Promise<
	{
		rank: number;
		userId: string;
		userName: string;
		points: number;
		level: number;
		streak: number;
	}[]
> {
	const pointsField = period === 'daily' ? 'weeklyPoints' : period === 'weekly' ? 'weeklyPoints' : 'monthlyPoints';

	const results = await db
		.select({
			userId: userStats.userId,
			userName: users.name,
			points: userStats[pointsField === 'weeklyPoints' ? 'weeklyPoints' : 'monthlyPoints'],
			totalPoints: userStats.totalPoints,
			level: userStats.level,
			streak: userStats.currentStreak
		})
		.from(userStats)
		.innerJoin(users, eq(userStats.userId, users.id))
		.where(eq(users.isActive, true))
		.orderBy(desc(userStats[pointsField === 'weeklyPoints' ? 'weeklyPoints' : 'monthlyPoints']))
		.limit(limit);

	return results.map((r, i) => ({
		rank: i + 1,
		userId: r.userId,
		userName: r.userName,
		points: r.points,
		level: r.level,
		streak: r.streak
	}));
}

/**
 * Get user's current position in leaderboard
 */
export async function getUserLeaderboardPosition(
	userId: string,
	period: 'daily' | 'weekly' | 'monthly'
): Promise<{ position: number; totalParticipants: number } | null> {
	const stats = await getOrCreateUserStats(userId);
	const pointsField = period === 'weekly' ? 'weeklyPoints' : 'monthlyPoints';
	const userPoints = stats[pointsField];

	// Count users with more points
	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(userStats)
		.innerJoin(users, eq(userStats.userId, users.id))
		.where(
			and(
				eq(users.isActive, true),
				sql`${userStats[pointsField]} > ${userPoints}`
			)
		);

	const [total] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(userStats)
		.innerJoin(users, eq(userStats.userId, users.id))
		.where(eq(users.isActive, true));

	return {
		position: (result?.count ?? 0) + 1,
		totalParticipants: total?.count ?? 0
	};
}

/**
 * Get user's recent point transactions
 */
export async function getRecentTransactions(
	userId: string,
	limit: number = 10
): Promise<PointTransaction[]> {
	return db
		.select()
		.from(pointTransactions)
		.where(eq(pointTransactions.userId, userId))
		.orderBy(desc(pointTransactions.earnedAt))
		.limit(limit);
}

/**
 * Get today's points for a user
 */
export async function getTodayPoints(userId: string): Promise<number> {
	const today = getPacificStartOfDay(new Date());

	const [result] = await db
		.select({ total: sql<number>`COALESCE(SUM(points), 0)::int` })
		.from(pointTransactions)
		.where(
			and(
				eq(pointTransactions.userId, userId),
				gte(pointTransactions.earnedAt, today)
			)
		);

	return result?.total ?? 0;
}

// ============================================================================
// RESET FUNCTIONS (for cron jobs)
// ============================================================================

/**
 * Reset weekly points for all users
 */
export async function resetWeeklyPoints(): Promise<void> {
	await db.update(userStats).set({ weeklyPoints: 0, updatedAt: new Date() });
	log.info('Reset weekly points for all users');
}

/**
 * Reset monthly points for all users
 */
export async function resetMonthlyPoints(): Promise<void> {
	await db.update(userStats).set({ monthlyPoints: 0, updatedAt: new Date() });
	log.info('Reset monthly points for all users');
}
