// Performance Context Provider - Staff performance metrics for AI agents
import { db, metrics, userStats, users } from '$lib/server/db';
import { and, gte, lte, eq, desc, sql } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import { toPacificDateString } from '$lib/server/utils/timezone';

interface UserPerformanceAlert {
	userName: string;
	userId: string;
	alerts: string[];
}

interface PerformanceContextData {
	teamAverages: {
		taskCompletionRate: number | null;
		avgCompletionTime: number | null;
		punctualityRate: number | null;
	};
	flaggedUsers: UserPerformanceAlert[];
	topPerformers: UserPerformanceAlert[];
	summary: {
		totalTracked: number;
		hasPerformanceData: number;
	};
}

export const performanceProvider: AIContextProvider<PerformanceContextData> = {
	moduleId: 'performance',
	moduleName: 'Staff Performance',
	description: 'Per-user staff performance trends and alerts from metrics and userStats',
	priority: 23, // After sales (22), before tasks (25)
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<PerformanceContextData> {
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		// Query recent performance metrics (last 7 days)
		const recentMetrics = await db
			.select({
				metricKey: metrics.metricKey,
				value: metrics.value,
				dimensions: metrics.dimensions
			})
			.from(metrics)
			.where(
				and(
					eq(metrics.metricType, 'staff_performance'),
					gte(metrics.periodStart, sevenDaysAgo),
					lte(metrics.periodEnd, now)
				)
			)
			.orderBy(desc(metrics.periodStart))
			.limit(200);

		// Query userStats for streaks and completion data
		const stats = await db
			.select({
				userId: userStats.userId,
				userName: users.name,
				currentStreak: userStats.currentStreak,
				onTimeRate: userStats.onTimeRate,
				tasksCompleted: userStats.tasksCompleted,
				tasksOnTime: userStats.tasksOnTime
			})
			.from(userStats)
			.innerJoin(users, eq(userStats.userId, users.id));

		// Parse metric dimensions for per-user data
		const userMetrics = new Map<string, {
			userName: string;
			completionRates: number[];
			completionTimes: number[];
			punctualityRates: number[];
		}>();

		for (const m of recentMetrics) {
			const dims = m.dimensions as Record<string, string>;
			const userId = dims?.user_id;
			if (!userId) continue;

			if (!userMetrics.has(userId)) {
				userMetrics.set(userId, {
					userName: dims.user_name || 'Unknown',
					completionRates: [],
					completionTimes: [],
					punctualityRates: []
				});
			}

			const entry = userMetrics.get(userId)!;
			const value = parseFloat(m.value);

			if (m.metricKey === 'task_completion_rate') {
				entry.completionRates.push(value);
			} else if (m.metricKey === 'task_completion_time_avg') {
				entry.completionTimes.push(value);
			} else if (m.metricKey === 'clock_in_punctuality') {
				entry.punctualityRates.push(value);
			}
		}

		// Calculate team averages
		const allCompletionRates: number[] = [];
		const allCompletionTimes: number[] = [];
		const allPunctualityRates: number[] = [];

		for (const [, data] of userMetrics) {
			if (data.completionRates.length > 0) {
				const avg = data.completionRates.reduce((a, b) => a + b, 0) / data.completionRates.length;
				allCompletionRates.push(avg);
			}
			if (data.completionTimes.length > 0) {
				const avg = data.completionTimes.reduce((a, b) => a + b, 0) / data.completionTimes.length;
				allCompletionTimes.push(avg);
			}
			if (data.punctualityRates.length > 0) {
				const avg = data.punctualityRates.reduce((a, b) => a + b, 0) / data.punctualityRates.length;
				allPunctualityRates.push(avg);
			}
		}

		const teamAvgCompletion = allCompletionRates.length > 0
			? allCompletionRates.reduce((a, b) => a + b, 0) / allCompletionRates.length
			: null;
		const teamAvgTime = allCompletionTimes.length > 0
			? allCompletionTimes.reduce((a, b) => a + b, 0) / allCompletionTimes.length
			: null;
		const teamAvgPunctuality = allPunctualityRates.length > 0
			? allPunctualityRates.reduce((a, b) => a + b, 0) / allPunctualityRates.length
			: null;

		// Identify flagged users (below average) and top performers
		const flaggedUsers: UserPerformanceAlert[] = [];
		const topPerformers: UserPerformanceAlert[] = [];

		// Check metrics-based alerts
		for (const [userId, data] of userMetrics) {
			const alerts: string[] = [];
			const praise: string[] = [];

			if (data.completionRates.length > 0) {
				const avg = data.completionRates.reduce((a, b) => a + b, 0) / data.completionRates.length;
				if (avg < 50) {
					alerts.push(`Task completion ${Math.round(avg)}% (team avg ${Math.round(teamAvgCompletion || 0)}%)`);
				} else if (teamAvgCompletion && avg > teamAvgCompletion * 1.2) {
					praise.push(`Task completion ${Math.round(avg)}% (above team avg)`);
				}
			}

			if (data.punctualityRates.length > 0) {
				const avg = data.punctualityRates.reduce((a, b) => a + b, 0) / data.punctualityRates.length;
				if (avg < 60) {
					alerts.push(`Punctuality ${Math.round(avg)}% (team avg ${Math.round(teamAvgPunctuality || 0)}%)`);
				} else if (teamAvgPunctuality && avg > teamAvgPunctuality * 1.1) {
					praise.push(`Punctuality ${Math.round(avg)}% (above team avg)`);
				}
			}

			if (alerts.length > 0) {
				flaggedUsers.push({ userName: data.userName, userId, alerts });
			}
			if (praise.length > 0) {
				topPerformers.push({ userName: data.userName, userId, alerts: praise });
			}
		}

		// Check userStats for streak and onTimeRate alerts
		for (const stat of stats) {
			const existingFlag = flaggedUsers.find(f => f.userId === stat.userId);
			const existingTop = topPerformers.find(t => t.userId === stat.userId);

			// Broken streak alert (had a streak, now 0)
			if (stat.currentStreak === 0 && stat.tasksCompleted > 5) {
				if (existingFlag) {
					existingFlag.alerts.push('Streak broken (was active)');
				} else {
					flaggedUsers.push({
						userName: stat.userName || 'Unknown',
						userId: stat.userId,
						alerts: ['Streak broken (was active)']
					});
				}
			}

			// High streak praise
			if (stat.currentStreak >= 5) {
				const msg = `${stat.currentStreak}-day streak active`;
				if (existingTop) {
					existingTop.alerts.push(msg);
				} else {
					topPerformers.push({
						userName: stat.userName || 'Unknown',
						userId: stat.userId,
						alerts: [msg]
					});
				}
			}

			// Low onTimeRate from userStats
			if (stat.onTimeRate && parseFloat(stat.onTimeRate) < 60 && stat.tasksCompleted > 3) {
				const rate = Math.round(parseFloat(stat.onTimeRate));
				if (existingFlag) {
					existingFlag.alerts.push(`On-time rate ${rate}%`);
				} else {
					flaggedUsers.push({
						userName: stat.userName || 'Unknown',
						userId: stat.userId,
						alerts: [`On-time rate ${rate}%`]
					});
				}
			}
		}

		const totalTracked = userMetrics.size + stats.filter(s => s.tasksCompleted > 0).length;

		return {
			teamAverages: {
				taskCompletionRate: teamAvgCompletion ? Math.round(teamAvgCompletion) : null,
				avgCompletionTime: teamAvgTime ? Math.round(teamAvgTime) : null,
				punctualityRate: teamAvgPunctuality ? Math.round(teamAvgPunctuality) : null
			},
			flaggedUsers: flaggedUsers.slice(0, 5), // Limit to keep tokens low
			topPerformers: topPerformers.slice(0, 3),
			summary: {
				totalTracked: new Set([...userMetrics.keys(), ...stats.map(s => s.userId)]).size,
				hasPerformanceData: totalTracked > 0 ? 1 : 0
			}
		};
	},

	estimateTokens(context: PerformanceContextData): number {
		// ~50 base + ~30 per flagged user + ~20 per top performer
		return 50 + context.flaggedUsers.length * 30 + context.topPerformers.length * 20;
	},

	formatForPrompt(context: PerformanceContextData): string {
		const lines: string[] = ['## Staff Performance'];

		if (!context.summary.hasPerformanceData) {
			lines.push('No performance data available yet.');
			return lines.join('\n');
		}

		// Team averages
		const ta = context.teamAverages;
		const avgParts: string[] = [];
		if (ta.taskCompletionRate !== null) avgParts.push(`completion ${ta.taskCompletionRate}%`);
		if (ta.punctualityRate !== null) avgParts.push(`punctuality ${ta.punctualityRate}%`);
		if (avgParts.length > 0) {
			lines.push(`Team avg (7d): ${avgParts.join(', ')}`);
		}

		// Flagged users
		if (context.flaggedUsers.length > 0) {
			lines.push('');
			lines.push('### Needs Attention');
			for (const user of context.flaggedUsers) {
				lines.push(`- **${user.userName}**: ${user.alerts.join('; ')}`);
			}
		}

		// Top performers
		if (context.topPerformers.length > 0) {
			lines.push('');
			lines.push('### Top Performers');
			for (const user of context.topPerformers) {
				lines.push(`- **${user.userName}**: ${user.alerts.join('; ')}`);
			}
		}

		return lines.join('\n');
	}
};
