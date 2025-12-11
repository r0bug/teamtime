/**
 * Task Rules Cron Endpoint
 *
 * Processes scheduled task rules and time-into-shift rules.
 * Should be called every 15 minutes via external cron.
 *
 * Example cron setup:
 * * /15 * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/tasks/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, taskAssignmentRules, taskTemplates, tasks } from '$lib/server/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { processTimeIntoShiftRules } from '$lib/server/services/task-rules';
import { CRON_SECRET } from '$env/static/private';

// Simple secret-based auth for cron jobs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET || 'teamtime-cron-secret';

	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also check query param for simple curl testing
	const url = new URL(request.url);
	if (url.searchParams.get('secret') === cronSecret) {
		return true;
	}

	return false;
}

/**
 * Simple cron expression matcher
 * Supports: minute hour day month weekday
 * Uses * for any, specific numbers, or ranges like 1-5
 */
function matchesCron(expression: string, date: Date): boolean {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) return false;

	const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;

	const minute = date.getMinutes();
	const hour = date.getHours();
	const day = date.getDate();
	const month = date.getMonth() + 1;
	const weekday = date.getDay();

	return (
		matchesCronPart(minuteExpr, minute) &&
		matchesCronPart(hourExpr, hour) &&
		matchesCronPart(dayExpr, day) &&
		matchesCronPart(monthExpr, month) &&
		matchesCronPart(weekdayExpr, weekday)
	);
}

function matchesCronPart(expr: string, value: number): boolean {
	if (expr === '*') return true;

	// Handle ranges like 1-5
	if (expr.includes('-')) {
		const [start, end] = expr.split('-').map(Number);
		return value >= start && value <= end;
	}

	// Handle lists like 1,3,5
	if (expr.includes(',')) {
		return expr.split(',').map(Number).includes(value);
	}

	// Handle step values like */15
	if (expr.startsWith('*/')) {
		const step = parseInt(expr.slice(2));
		return value % step === 0;
	}

	// Simple number match
	return parseInt(expr) === value;
}

export const GET: RequestHandler = async ({ request, url }) => {
	// Validate request
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date();
	const results = {
		scheduledTasks: { created: 0, errors: [] as string[] },
		timeIntoShift: { created: 0, errors: [] as string[] },
		timestamp: now.toISOString()
	};

	console.log(`[Task Cron] Running at ${now.toISOString()}`);

	try {
		// Process scheduled rules
		const scheduledRules = await db
			.select({
				rule: taskAssignmentRules,
				template: taskTemplates
			})
			.from(taskAssignmentRules)
			.innerJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
			.where(
				and(
					eq(taskAssignmentRules.triggerType, 'schedule'),
					eq(taskAssignmentRules.isActive, true),
					eq(taskTemplates.isActive, true)
				)
			);

		for (const { rule, template } of scheduledRules) {
			try {
				const cronExpr = rule.triggerConfig?.cronExpression;
				if (!cronExpr) continue;

				// Check if cron matches current time (with 15-minute window)
				if (!matchesCron(cronExpr, now)) continue;

				// Check conditions
				const conditions = rule.conditions;
				if (conditions?.daysOfWeek && conditions.daysOfWeek.length > 0) {
					if (!conditions.daysOfWeek.includes(now.getDay())) continue;
				}
				if (conditions?.timeWindowStart || conditions?.timeWindowEnd) {
					const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
					if (conditions.timeWindowStart && currentTime < conditions.timeWindowStart) continue;
					if (conditions.timeWindowEnd && currentTime > conditions.timeWindowEnd) continue;
				}

				// Check if we already created a task from this rule in the last 14 minutes
				// (to prevent duplicates when cron runs every 15 mins)
				const recentTaskCutoff = new Date(now.getTime() - 14 * 60 * 1000);
				const existingTask = await db
					.select({ count: sql<number>`count(*)` })
					.from(tasks)
					.where(
						and(
							eq(tasks.templateId, template.id),
							eq(tasks.linkedEventId, rule.id),
							gte(tasks.createdAt, recentTaskCutoff)
						)
					);

				if ((existingTask[0]?.count || 0) > 0) continue;

				// Determine assignee based on assignment type
				// For scheduled tasks, we need a default assignee strategy
				let assigneeId: string | null = null;

				if (rule.assignmentType === 'specific_user' && rule.assignmentConfig?.userId) {
					assigneeId = rule.assignmentConfig.userId;
				}
				// For other assignment types, we'd need more context
				// For now, scheduled tasks with rotation/staff assignment are skipped
				// unless they specify a user

				if (!assigneeId) {
					results.scheduledTasks.errors.push(
						`Rule "${rule.name}" requires specific_user assignment for scheduled triggers`
					);
					continue;
				}

				// Create the task
				const dueAt = new Date(now);
				dueAt.setHours(23, 59, 59, 999);

				await db.insert(tasks).values({
					templateId: template.id,
					title: template.name,
					description: template.description,
					assignedTo: assigneeId,
					priority: 'medium',
					dueAt,
					status: 'not_started',
					photoRequired: template.photoRequired,
					notesRequired: template.notesRequired,
					source: 'event_triggered',
					linkedEventId: rule.id,
					createdBy: null
				});

				// Update rule stats
				await db
					.update(taskAssignmentRules)
					.set({
						lastTriggeredAt: now,
						triggerCount: sql`${taskAssignmentRules.triggerCount} + 1`,
						updatedAt: now
					})
					.where(eq(taskAssignmentRules.id, rule.id));

				results.scheduledTasks.created++;
				console.log(`[Task Cron] Created scheduled task from rule: ${rule.name}`);
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : 'Unknown error';
				results.scheduledTasks.errors.push(`Error processing rule ${rule.name}: ${errMsg}`);
			}
		}

		// Process time-into-shift rules
		const timeIntoShiftResult = await processTimeIntoShiftRules();
		results.timeIntoShift.created = timeIntoShiftResult.tasksCreated;
		results.timeIntoShift.errors = timeIntoShiftResult.errors;

		console.log(
			`[Task Cron] Completed. Scheduled: ${results.scheduledTasks.created}, Time-into-shift: ${results.timeIntoShift.created}`
		);

		return json({
			success: true,
			...results
		});
	} catch (error) {
		console.error('[Task Cron] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				...results
			},
			{ status: 500 }
		);
	}
};
