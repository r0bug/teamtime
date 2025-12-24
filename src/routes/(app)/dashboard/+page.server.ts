import type { PageServerLoad } from './$types';
import { db, shifts, timeEntries, tasks, conversationParticipants, messages, inventoryDrops, inventoryDropItems } from '$lib/server/db';
import { eq, and, isNull, gt, gte, lt, sql } from 'drizzle-orm';
import { isPurchaser } from '$lib/server/auth/roles';
import { getOrCreateUserStats, getTodayPoints, getLeaderboard, getUserLeaderboardPosition, LEVEL_THRESHOLDS } from '$lib/server/services/points-service';
import { getRecentAchievements, getAchievementStats } from '$lib/server/services/achievements-service';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const now = new Date();
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(now);
	endOfDay.setHours(23, 59, 59, 999);

	// Get next shift
	const [nextShift] = await db.query.shifts.findMany({
		where: and(
			eq(shifts.userId, user.id),
			gt(shifts.startTime, now)
		),
		orderBy: (shifts, { asc }) => [asc(shifts.startTime)],
		limit: 1,
		with: {
			location: true
		}
	});

	// Get active time entry (clocked in but not out)
	const [activeTimeEntry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(
				eq(timeEntries.userId, user.id),
				isNull(timeEntries.clockOut)
			)
		)
		.limit(1);

	// Get pending tasks count
	const [{ count: pendingTasks }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(tasks)
		.where(
			and(
				eq(tasks.assignedTo, user.id),
				eq(tasks.status, 'not_started')
			)
		);

	// Get unread messages count
	const unreadResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(conversationParticipants)
		.innerJoin(messages, eq(messages.conversationId, conversationParticipants.conversationId))
		.where(
			and(
				eq(conversationParticipants.userId, user.id),
				sql`${messages.createdAt} > COALESCE(${conversationParticipants.lastReadAt}, '1970-01-01')`
			)
		);
	const unreadMessages = unreadResult[0]?.count || 0;

	// Inventory drop stats for purchasers and above
	let dropStats = null;
	if (isPurchaser(user)) {
		// Pending drops (awaiting processing)
		const [{ count: pendingDrops }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(inventoryDrops)
			.where(eq(inventoryDrops.status, 'pending'));

		// Items identified today
		const [{ count: itemsToday }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(inventoryDropItems)
			.where(gte(inventoryDropItems.createdAt, startOfDay));

		// Processing drops
		const [{ count: processingDrops }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(inventoryDrops)
			.where(eq(inventoryDrops.status, 'processing'));

		dropStats = {
			pendingDrops: pendingDrops || 0,
			processingDrops: processingDrops || 0,
			itemsToday: itemsToday || 0
		};
	}

	// Load gamification data
	let gamification = null;
	try {
		const userStats = await getOrCreateUserStats(user.id);
		const todayPoints = await getTodayPoints(user.id);
		const leaderboard = await getLeaderboard('weekly', 5);
		const position = await getUserLeaderboardPosition(user.id, 'weekly');
		const recentAchievements = await getRecentAchievements(user.id, 3);
		const achievementStats = await getAchievementStats(user.id);

		// Get level name
		const levelInfo = LEVEL_THRESHOLDS.find((l) => l.level === userStats.level) || LEVEL_THRESHOLDS[0];
		const nextLevelInfo = LEVEL_THRESHOLDS.find((l) => l.level === userStats.level + 1);

		gamification = {
			totalPoints: userStats.totalPoints,
			weeklyPoints: userStats.weeklyPoints,
			todayPoints,
			level: userStats.level,
			levelName: levelInfo.name,
			levelProgress: userStats.levelProgress,
			nextLevelPoints: nextLevelInfo?.minPoints || levelInfo.minPoints,
			currentStreak: userStats.currentStreak,
			longestStreak: userStats.longestStreak,
			leaderboard,
			position: position?.position || 0,
			recentAchievements: recentAchievements.map((a) => ({
				code: a.code,
				name: a.name,
				icon: a.icon,
				tier: a.tier
			})),
			achievementStats: {
				earned: achievementStats.earned,
				total: achievementStats.total
			}
		};
	} catch (err) {
		console.error('Error loading gamification data:', err);
	}

	return {
		nextShift,
		activeTimeEntry,
		pendingTasks: pendingTasks || 0,
		unreadMessages,
		dropStats,
		userIsPurchaser: isPurchaser(user),
		gamification
	};
};
