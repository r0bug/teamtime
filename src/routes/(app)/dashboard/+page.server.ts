import type { PageServerLoad } from './$types';
import { db, shifts, timeEntries, tasks, conversationParticipants, messages, inventoryDrops, inventoryDropItems, users, locations, pricingDecisions } from '$lib/server/db';
import { eq, and, isNull, gt, gte, lt, sql, inArray, desc } from 'drizzle-orm';
import { isPurchaser, isManager, isAdmin } from '$lib/server/auth/roles';
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

	// ==========================================
	// WHO'S WORKING DATA
	// ==========================================

	// Get currently clocked-in users
	const clockedInData = await db
		.select({
			id: users.id,
			name: users.name,
			avatarUrl: users.avatarUrl,
			clockInTime: timeEntries.clockIn,
			clockInAddress: timeEntries.clockInAddress
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(
			isNull(timeEntries.clockOut),
			eq(users.isActive, true)
		))
		.orderBy(timeEntries.clockIn);

	// Get today's scheduled shifts
	const scheduledData = await db
		.select({
			id: users.id,
			name: users.name,
			avatarUrl: users.avatarUrl,
			shiftStart: shifts.startTime,
			shiftEnd: shifts.endTime,
			locationName: locations.name
		})
		.from(shifts)
		.innerJoin(users, eq(shifts.userId, users.id))
		.leftJoin(locations, eq(shifts.locationId, locations.id))
		.where(and(
			gte(shifts.startTime, startOfDay),
			lt(shifts.startTime, endOfDay),
			eq(users.isActive, true)
		))
		.orderBy(shifts.startTime);

	// Create clocked-in user IDs set for quick lookup
	const clockedInUserIds = new Set(clockedInData.map(u => u.id));

	// Transform scheduled data to include isClockedIn flag
	const scheduledToday = scheduledData.map(s => ({
		...s,
		shiftStart: s.shiftStart.toISOString(),
		shiftEnd: s.shiftEnd.toISOString(),
		isClockedIn: clockedInUserIds.has(s.id)
	}));

	// Transform clocked in data
	const clockedIn = clockedInData.map(c => ({
		...c,
		clockInTime: c.clockInTime.toISOString()
	}));

	// Determine viewer role for access control
	type ViewerRole = 'admin' | 'manager' | 'purchaser' | 'staff';
	const viewerRole: ViewerRole = isAdmin(user) ? 'admin' : isManager(user) ? 'manager' : isPurchaser(user) ? 'purchaser' : 'staff';

	// Staff details (only for manager/admin)
	let staffDetails: Record<string, {
		incompleteTasks: Array<{ id: string; title: string; priority: string; status: string }>;
		clockHistory: Array<{ clockIn: string; clockOut: string | null; address: string | null }>;
		pricingDecisions?: Array<{ id: string; itemDescription: string; price: string; pricedAt: string }>;
		recentMessages?: Array<{ id: string; content: string; createdAt: string; conversationTitle: string | null }>;
	}> | null = null;

	if (isManager(user)) {
		staffDetails = {};

		// Get all user IDs we need details for (clocked in + scheduled)
		const allUserIds = [...new Set([
			...clockedInData.map(u => u.id),
			...scheduledData.map(u => u.id)
		])];

		for (const userId of allUserIds) {
			// Get incomplete tasks for this user
			const userTasks = await db
				.select({
					id: tasks.id,
					title: tasks.title,
					priority: tasks.priority,
					status: tasks.status
				})
				.from(tasks)
				.where(and(
					eq(tasks.assignedTo, userId),
					inArray(tasks.status, ['not_started', 'in_progress'])
				))
				.orderBy(desc(tasks.createdAt))
				.limit(5);

			// Get recent clock history (last 3 entries)
			const clockHistory = await db
				.select({
					clockIn: timeEntries.clockIn,
					clockOut: timeEntries.clockOut,
					address: timeEntries.clockInAddress
				})
				.from(timeEntries)
				.where(eq(timeEntries.userId, userId))
				.orderBy(desc(timeEntries.clockIn))
				.limit(3);

			const details: typeof staffDetails[string] = {
				incompleteTasks: userTasks.map(t => ({
					id: t.id,
					title: t.title,
					priority: t.priority,
					status: t.status
				})),
				clockHistory: clockHistory.map(c => ({
					clockIn: c.clockIn.toISOString(),
					clockOut: c.clockOut?.toISOString() ?? null,
					address: c.address
				}))
			};

			// Admin-only: pricing decisions and messages
			if (isAdmin(user)) {
				// Get recent pricing decisions
				const userPricing = await db
					.select({
						id: pricingDecisions.id,
						itemDescription: pricingDecisions.itemDescription,
						price: pricingDecisions.price,
						pricedAt: pricingDecisions.pricedAt
					})
					.from(pricingDecisions)
					.where(eq(pricingDecisions.userId, userId))
					.orderBy(desc(pricingDecisions.pricedAt))
					.limit(3);

				details.pricingDecisions = userPricing.map(p => ({
					id: p.id,
					itemDescription: p.itemDescription,
					price: p.price,
					pricedAt: p.pricedAt.toISOString()
				}));

				// Get recent messages sent by this user
				const userMessages = await db
					.select({
						id: messages.id,
						content: messages.content,
						createdAt: messages.createdAt,
						conversationId: messages.conversationId
					})
					.from(messages)
					.where(eq(messages.senderId, userId))
					.orderBy(desc(messages.createdAt))
					.limit(3);

				details.recentMessages = userMessages.map(m => ({
					id: m.id,
					content: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
					createdAt: m.createdAt.toISOString(),
					conversationTitle: null // Could join with conversations table if needed
				}));
			}

			staffDetails[userId] = details;
		}
	}

	const whosWorking = {
		clockedIn,
		scheduledToday,
		staffDetails,
		viewerRole
	};

	return {
		nextShift,
		activeTimeEntry,
		pendingTasks: pendingTasks || 0,
		unreadMessages,
		dropStats,
		userIsPurchaser: isPurchaser(user),
		gamification,
		whosWorking
	};
};
