// View Points Tool - Allows AI to query user points, stats, and leaderboard
import { db, userStats, users, pointTransactions } from '$lib/server/db';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import { LEVEL_THRESHOLDS } from '$lib/server/services/points-service';

const log = createLogger('ai:tools:view-points');

interface ViewPointsParams {
	userId?: string;
	period?: 'today' | 'week' | 'month' | 'all';
	showLeaderboard?: boolean;
	limit?: number;
}

interface UserPointStats {
	userId: string;
	userName: string;
	totalPoints: number;
	weeklyPoints: number;
	monthlyPoints: number;
	level: number;
	levelName: string;
	levelProgress: number;
	currentStreak: number;
	longestStreak: number;
	breakdown: {
		attendance: number;
		tasks: number;
		pricing: number;
		sales: number;
	};
}

interface ViewPointsResult {
	success: boolean;
	user?: UserPointStats;
	leaderboard?: UserPointStats[];
	recentTransactions?: Array<{
		points: number;
		action: string;
		description: string | null;
		createdAt: string;
	}>;
	error?: string;
}

function getLevelName(level: number): string {
	const levelInfo = LEVEL_THRESHOLDS.find(l => l.level === level);
	return levelInfo?.name || 'Unknown';
}

export const viewPointsTool: AITool<ViewPointsParams, ViewPointsResult> = {
	name: 'view_points',
	description: 'View a user\'s points, level, streak, and stats. Can also show the team leaderboard. Use this to understand performance, recognize achievements, or identify who might need encouragement.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'Specific user ID to view stats for (optional - omit for leaderboard view)'
			},
			period: {
				type: 'string',
				enum: ['today', 'week', 'month', 'all'],
				description: 'Time period for recent transactions (default: week)'
			},
			showLeaderboard: {
				type: 'boolean',
				description: 'Include team leaderboard in response (default: false)'
			},
			limit: {
				type: 'number',
				description: 'Number of leaderboard entries or transactions to return (default: 10)'
			}
		},
		required: []
	},

	requiresApproval: false,
	// No cooldown for read-only tool
	rateLimit: {
		maxPerHour: 50
	},

	validate(params: ViewPointsParams) {
		if (params.userId) {
			const validation = validateUserId(params.userId, 'userId');
			if (!validation.valid) return validation;
		}
		if (params.limit && (params.limit < 1 || params.limit > 50)) {
			return { valid: false, error: 'Limit must be between 1 and 50' };
		}
		return { valid: true };
	},

	async execute(params: ViewPointsParams, context: ToolExecutionContext): Promise<ViewPointsResult> {
		try {
			const limit = params.limit || 10;
			let result: ViewPointsResult = { success: true };

			// If specific user requested
			if (params.userId) {
				const [stats] = await db
					.select({
						userId: userStats.userId,
						totalPoints: userStats.totalPoints,
						weeklyPoints: userStats.weeklyPoints,
						monthlyPoints: userStats.monthlyPoints,
						level: userStats.level,
						levelProgress: userStats.levelProgress,
						currentStreak: userStats.currentStreak,
						longestStreak: userStats.longestStreak,
						attendancePoints: userStats.attendancePoints,
						taskPoints: userStats.taskPoints,
						pricingPoints: userStats.pricingPoints,
						salesPoints: userStats.salesPoints,
						userName: users.name
					})
					.from(userStats)
					.innerJoin(users, eq(userStats.userId, users.id))
					.where(eq(userStats.userId, params.userId));

				if (!stats) {
					return { success: false, error: 'User stats not found' };
				}

				result.user = {
					userId: stats.userId,
					userName: stats.userName,
					totalPoints: stats.totalPoints,
					weeklyPoints: stats.weeklyPoints,
					monthlyPoints: stats.monthlyPoints,
					level: stats.level,
					levelName: getLevelName(stats.level),
					levelProgress: stats.levelProgress,
					currentStreak: stats.currentStreak,
					longestStreak: stats.longestStreak,
					breakdown: {
						attendance: stats.attendancePoints,
						tasks: stats.taskPoints,
						pricing: stats.pricingPoints,
						sales: stats.salesPoints
					}
				};

				// Get recent transactions
				const periodDays = {
					today: 1,
					week: 7,
					month: 30,
					all: 365
				};
				const days = periodDays[params.period || 'week'];
				const since = new Date();
				since.setDate(since.getDate() - days);

				const transactions = await db
					.select({
						points: pointTransactions.points,
						action: pointTransactions.action,
						description: pointTransactions.description,
						createdAt: pointTransactions.createdAt
					})
					.from(pointTransactions)
					.where(and(
						eq(pointTransactions.userId, params.userId),
						gte(pointTransactions.createdAt, since)
					))
					.orderBy(desc(pointTransactions.createdAt))
					.limit(limit);

				result.recentTransactions = transactions.map(t => ({
					points: t.points,
					action: t.action,
					description: t.description,
					createdAt: t.createdAt.toISOString()
				}));
			}

			// If leaderboard requested (or no specific user)
			if (params.showLeaderboard || !params.userId) {
				const leaderboard = await db
					.select({
						userId: userStats.userId,
						totalPoints: userStats.totalPoints,
						weeklyPoints: userStats.weeklyPoints,
						monthlyPoints: userStats.monthlyPoints,
						level: userStats.level,
						levelProgress: userStats.levelProgress,
						currentStreak: userStats.currentStreak,
						longestStreak: userStats.longestStreak,
						attendancePoints: userStats.attendancePoints,
						taskPoints: userStats.taskPoints,
						pricingPoints: userStats.pricingPoints,
						salesPoints: userStats.salesPoints,
						userName: users.name
					})
					.from(userStats)
					.innerJoin(users, eq(userStats.userId, users.id))
					.where(eq(users.isActive, true))
					.orderBy(desc(userStats.weeklyPoints))
					.limit(limit);

				result.leaderboard = leaderboard.map(s => ({
					userId: s.userId,
					userName: s.userName,
					totalPoints: s.totalPoints,
					weeklyPoints: s.weeklyPoints,
					monthlyPoints: s.monthlyPoints,
					level: s.level,
					levelName: getLevelName(s.level),
					levelProgress: s.levelProgress,
					currentStreak: s.currentStreak,
					longestStreak: s.longestStreak,
					breakdown: {
						attendance: s.attendancePoints,
						tasks: s.taskPoints,
						pricing: s.pricingPoints,
						sales: s.salesPoints
					}
				}));
			}

			return result;
		} catch (error) {
			log.error('View points tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ViewPointsResult): string {
		if (!result.success) {
			return `Failed to view points: ${result.error}`;
		}

		const parts: string[] = [];

		if (result.user) {
			const u = result.user;
			parts.push(`${u.userName}: Level ${u.level} ${u.levelName} (${u.totalPoints} total pts, ${u.weeklyPoints} this week, ${u.currentStreak}-day streak)`);
		}

		if (result.leaderboard && result.leaderboard.length > 0) {
			parts.push('Weekly Leaderboard:');
			result.leaderboard.forEach((u, i) => {
				parts.push(`${i + 1}. ${u.userName}: ${u.weeklyPoints} pts (L${u.level} ${u.levelName})`);
			});
		}

		if (result.recentTransactions && result.recentTransactions.length > 0) {
			parts.push(`Recent transactions: ${result.recentTransactions.slice(0, 5).map(t => `${t.points > 0 ? '+' : ''}${t.points} (${t.action})`).join(', ')}`);
		}

		return parts.join('\n') || 'No points data available';
	}
};
