/**
 * @module Services/MetricCollectors/TeamTimeCollector
 * @description Collects metrics from TeamTime operational data.
 *
 * This collector gathers metrics from:
 * - Tasks: completion rates, completion times
 * - Time Entries: punctuality, attendance patterns
 * - Messages: response times (when applicable)
 *
 * Metrics provided:
 * - task_completion_rate: Tasks completed / assigned per user per day
 * - task_completion_time_avg: Average time to complete tasks
 * - clock_in_punctuality: Percentage of on-time clock-ins
 * - message_response_time_avg: Average response time to messages
 */

import { db, tasks, taskCompletions, timeEntries, shifts, users } from '$lib/server/db';
import { eq, and, gte, lt, sql, isNotNull, count } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import type { MetricCollector, DateRange, CollectedMetric } from './types';

const log = createLogger('services:metric-collectors:teamtime');

/**
 * Calculate the number of minutes between two dates.
 */
function minutesBetween(start: Date, end: Date): number {
	return (end.getTime() - start.getTime()) / (1000 * 60);
}

/**
 * Get the start of a day in UTC.
 */
function getStartOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

/**
 * Get the end of a day in UTC.
 */
function getEndOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(23, 59, 59, 999);
	return d;
}

/**
 * Iterate through days in a date range.
 */
function* iterateDays(start: Date, end: Date): Generator<{ dayStart: Date; dayEnd: Date; dateStr: string }> {
	const current = getStartOfDay(start);
	const endDay = getStartOfDay(end);

	while (current <= endDay) {
		const dayStart = new Date(current);
		const dayEnd = getEndOfDay(current);
		const dateStr = dayStart.toISOString().split('T')[0];

		yield { dayStart, dayEnd, dateStr };

		current.setDate(current.getDate() + 1);
	}
}

/**
 * Collect task completion rate metrics.
 * Calculates: Tasks completed / Tasks assigned per user per day
 */
async function collectTaskCompletionRate(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	for (const { dayStart, dayEnd, dateStr } of iterateDays(dateRange.start, dateRange.end)) {
		// Get tasks assigned during this day
		const assignedTasks = await db
			.select({
				userId: tasks.assignedTo,
				taskCount: count()
			})
			.from(tasks)
			.where(
				and(
					gte(tasks.createdAt, dayStart),
					lt(tasks.createdAt, dayEnd),
					isNotNull(tasks.assignedTo)
				)
			)
			.groupBy(tasks.assignedTo);

		// Get task completions during this day
		const completedTasks = await db
			.select({
				userId: taskCompletions.completedBy,
				taskCount: count()
			})
			.from(taskCompletions)
			.where(
				and(
					gte(taskCompletions.completedAt, dayStart),
					lt(taskCompletions.completedAt, dayEnd)
				)
			)
			.groupBy(taskCompletions.completedBy);

		// Build a map of completed tasks by user
		const completedMap = new Map<string, number>();
		for (const row of completedTasks) {
			if (row.userId) {
				completedMap.set(row.userId, Number(row.taskCount));
			}
		}

		// Calculate completion rate for each user with assigned tasks
		for (const row of assignedTasks) {
			if (!row.userId) continue;

			const assigned = Number(row.taskCount);
			const completed = completedMap.get(row.userId) || 0;
			const rate = assigned > 0 ? (completed / assigned) * 100 : 0;

			metrics.push({
				metricType: 'task_completion_rate',
				metricKey: `${row.userId}:${dateStr}`,
				value: Math.round(rate * 100) / 100,
				dimensions: {
					userId: row.userId,
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'tasks',
				metadata: {
					tasksAssigned: assigned,
					tasksCompleted: completed
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected task completion rate metrics');
	return metrics;
}

/**
 * Collect average task completion time metrics.
 * Calculates: Average time from task creation to completion per user per day
 */
async function collectTaskCompletionTimeAvg(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	for (const { dayStart, dayEnd, dateStr } of iterateDays(dateRange.start, dateRange.end)) {
		// Get task completions with their task creation times
		const completions = await db
			.select({
				userId: taskCompletions.completedBy,
				completedAt: taskCompletions.completedAt,
				taskCreatedAt: tasks.createdAt
			})
			.from(taskCompletions)
			.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(
				and(
					gte(taskCompletions.completedAt, dayStart),
					lt(taskCompletions.completedAt, dayEnd)
				)
			);

		// Group by user and calculate average
		const userTimes = new Map<string, number[]>();
		for (const row of completions) {
			if (!row.userId || !row.taskCreatedAt) continue;

			const completedAt = new Date(row.completedAt);
			const createdAt = new Date(row.taskCreatedAt);
			const minutes = minutesBetween(createdAt, completedAt);

			if (minutes >= 0) {
				const times = userTimes.get(row.userId) || [];
				times.push(minutes);
				userTimes.set(row.userId, times);
			}
		}

		// Calculate average for each user
		for (const [userId, times] of userTimes) {
			const avg = times.reduce((sum, t) => sum + t, 0) / times.length;

			metrics.push({
				metricType: 'task_completion_time_avg',
				metricKey: `${userId}:${dateStr}`,
				value: Math.round(avg * 100) / 100,
				dimensions: {
					userId,
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'task_completions',
				metadata: {
					taskCount: times.length,
					unit: 'minutes'
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected task completion time avg metrics');
	return metrics;
}

/**
 * Collect clock-in punctuality metrics.
 * Calculates: Percentage of on-time clock-ins (within 5 minutes of scheduled shift)
 */
async function collectClockInPunctuality(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];
	const ON_TIME_THRESHOLD_MINUTES = 5;

	for (const { dayStart, dayEnd, dateStr } of iterateDays(dateRange.start, dateRange.end)) {
		// Get time entries with their corresponding shifts
		const entries = await db
			.select({
				userId: timeEntries.userId,
				clockIn: timeEntries.clockIn,
				shiftStart: shifts.startTime
			})
			.from(timeEntries)
			.leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
			.where(
				and(
					gte(timeEntries.clockIn, dayStart),
					lt(timeEntries.clockIn, dayEnd)
				)
			);

		// Group by user
		const userPunctuality = new Map<string, { onTime: number; total: number }>();

		for (const entry of entries) {
			if (!entry.userId) continue;

			const stats = userPunctuality.get(entry.userId) || { onTime: 0, total: 0 };
			stats.total++;

			// If there's a scheduled shift, check if clock-in was on time
			if (entry.shiftStart) {
				const clockIn = new Date(entry.clockIn);
				const shiftStart = new Date(entry.shiftStart);
				const minutesLate = minutesBetween(shiftStart, clockIn);

				// On time = clock in no more than 5 minutes after shift start
				// (or any amount before)
				if (minutesLate <= ON_TIME_THRESHOLD_MINUTES) {
					stats.onTime++;
				}
			} else {
				// No shift scheduled, count as on time
				stats.onTime++;
			}

			userPunctuality.set(entry.userId, stats);
		}

		// Calculate punctuality rate for each user
		for (const [userId, stats] of userPunctuality) {
			const rate = stats.total > 0 ? (stats.onTime / stats.total) * 100 : 0;

			metrics.push({
				metricType: 'clock_in_punctuality',
				metricKey: `${userId}:${dateStr}`,
				value: Math.round(rate * 100) / 100,
				dimensions: {
					userId,
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'time_entries',
				metadata: {
					onTimeCount: stats.onTime,
					totalClockIns: stats.total,
					thresholdMinutes: ON_TIME_THRESHOLD_MINUTES
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected clock-in punctuality metrics');
	return metrics;
}

/**
 * Collect message response time metrics.
 * Calculates: Average response time to messages per user per day
 *
 * Note: This requires a messages table with reply tracking.
 * Currently returns empty if messaging data structure doesn't support this.
 */
async function collectMessageResponseTimeAvg(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	// TODO: Implement when message threading/reply data is available
	// This would require:
	// 1. A messages table with parent_message_id or similar
	// 2. Query to find reply messages and their original messages
	// 3. Calculate time between original message and first reply

	log.debug({ count: 0 }, 'Message response time collection not yet implemented');
	return metrics;
}

/**
 * TeamTime metric collector.
 * Collects operational metrics from tasks, time entries, and messages.
 */
export const teamTimeCollector: MetricCollector = {
	name: 'teamtime',
	description: 'Collects operational metrics from TeamTime data including tasks, attendance, and messaging',
	metricTypes: [
		'task_completion_rate',
		'task_completion_time_avg',
		'clock_in_punctuality',
		'message_response_time_avg'
	],

	async collect(dateRange: DateRange): Promise<CollectedMetric[]> {
		log.info({
			startDate: dateRange.start.toISOString(),
			endDate: dateRange.end.toISOString()
		}, 'Collecting TeamTime metrics');

		const allMetrics: CollectedMetric[] = [];

		// Collect all metric types
		const [
			completionRateMetrics,
			completionTimeMetrics,
			punctualityMetrics,
			responseTimeMetrics
		] = await Promise.all([
			collectTaskCompletionRate(dateRange),
			collectTaskCompletionTimeAvg(dateRange),
			collectClockInPunctuality(dateRange),
			collectMessageResponseTimeAvg(dateRange)
		]);

		allMetrics.push(
			...completionRateMetrics,
			...completionTimeMetrics,
			...punctualityMetrics,
			...responseTimeMetrics
		);

		log.info({
			totalMetrics: allMetrics.length,
			byType: {
				task_completion_rate: completionRateMetrics.length,
				task_completion_time_avg: completionTimeMetrics.length,
				clock_in_punctuality: punctualityMetrics.length,
				message_response_time_avg: responseTimeMetrics.length
			}
		}, 'TeamTime metrics collection completed');

		return allMetrics;
	}
};

export default teamTimeCollector;
