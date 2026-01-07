/**
 * Task Assignment Rules Service
 *
 * Handles the evaluation and execution of task assignment rules.
 * Creates tasks automatically based on triggers like clock-in/out,
 * time into shift, task completion, and scheduled events.
 */

import { db, taskAssignmentRules, taskTemplates, tasks, users, timeEntries, shifts, cashCountConfigs, cashCountTaskLinks, locations } from '$lib/server/db';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:task-rules');
import { eq, and, sql, desc, isNull, gte, ne, or } from 'drizzle-orm';
import type { TaskAssignmentRule, TaskTemplate, CashCountConfig } from '$lib/server/db/schema';
import { getPacificDateParts, getPacificStartOfDay, getPacificEndOfDay } from '$lib/server/utils/timezone';

export type TriggerEvent =
	| 'clock_in'
	| 'clock_out'
	| 'first_clock_in'
	| 'last_clock_out'
	| 'time_into_shift'
	| 'task_completed'
	| 'schedule'
	| 'closing_shift';

export interface TriggerContext {
	userId: string;
	locationId?: string;
	taskTemplateId?: string; // For task_completed trigger
	timestamp?: Date;
}

interface RuleWithTemplate extends TaskAssignmentRule {
	template: TaskTemplate | null;
	cashCountConfig: CashCountConfig | null;
	locationName: string | null;
}

/**
 * Process rules for a given trigger event
 */
export async function processRulesForTrigger(
	triggerEvent: TriggerEvent,
	context: TriggerContext
): Promise<{ tasksCreated: number; errors: string[] }> {
	const results = { tasksCreated: 0, errors: [] as string[] };

	log.info({ triggerEvent, userId: context.userId, locationId: context.locationId }, 'Processing rules for trigger');

	try {
		// Get all active rules for this trigger type
		// Rules can have either a templateId OR a cashCountConfigId
		const rules = await db
			.select({
				rule: taskAssignmentRules,
				template: taskTemplates,
				cashCountConfig: cashCountConfigs,
				locationName: locations.name
			})
			.from(taskAssignmentRules)
			.leftJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
			.leftJoin(cashCountConfigs, eq(taskAssignmentRules.cashCountConfigId, cashCountConfigs.id))
			.leftJoin(locations, eq(cashCountConfigs.locationId, locations.id))
			.where(
				and(
					eq(taskAssignmentRules.triggerType, triggerEvent),
					eq(taskAssignmentRules.isActive, true),
					// Either template is active OR we're using cash count config
					or(
						and(
							isNull(taskAssignmentRules.cashCountConfigId),
							eq(taskTemplates.isActive, true)
						),
						and(
							isNull(taskAssignmentRules.templateId),
							eq(cashCountConfigs.isActive, true)
						)
					)
				)
			)
			.orderBy(desc(taskAssignmentRules.priority));

		log.info({ rulesFound: rules.length, triggerEvent }, 'Found rules for trigger');

		for (const { rule, template, cashCountConfig, locationName } of rules) {
			try {
				// Check if rule conditions are met
				if (!evaluateConditions(rule, context)) {
					log.debug({ ruleName: rule.name, ruleId: rule.id, conditions: rule.conditions }, 'Rule conditions not met');
					continue;
				}

				log.info({ ruleName: rule.name, ruleId: rule.id }, 'Rule conditions met, processing');

				// For task_completed trigger, check if template matches
				if (
					triggerEvent === 'task_completed' &&
					rule.triggerConfig?.taskTemplateId !== context.taskTemplateId
				) {
					continue;
				}

				// Determine the assignee
				const assigneeId = await determineAssignee(rule, context);
				if (!assigneeId) {
					results.errors.push(`No assignee found for rule: ${rule.name}`);
					continue;
				}

				// Create the task (either from template or cash count config)
				if (cashCountConfig) {
					await createCashCountTaskFromRule(rule, cashCountConfig, locationName, assigneeId, context);
				} else if (template) {
					await createTaskFromRule(rule, template, assigneeId, context);
				} else {
					results.errors.push(`Rule ${rule.name} has neither template nor cash count config`);
					continue;
				}

				// Update rule stats
				await db
					.update(taskAssignmentRules)
					.set({
						lastTriggeredAt: new Date(),
						triggerCount: sql`${taskAssignmentRules.triggerCount} + 1`,
						updatedAt: new Date()
					})
					.where(eq(taskAssignmentRules.id, rule.id));

				results.tasksCreated++;
				log.info({ ruleName: rule.name, ruleId: rule.id, assigneeId }, 'Task created from rule');
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : 'Unknown error';
				log.error({ error, ruleName: rule.name, ruleId: rule.id }, 'Error processing rule');
				results.errors.push(`Error processing rule ${rule.name}: ${errMsg}`);
			}
		}
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error({ error }, 'Error fetching rules');
		results.errors.push(`Error fetching rules: ${errMsg}`);
	}

	log.info({ tasksCreated: results.tasksCreated, errors: results.errors.length }, 'Finished processing trigger');
	return results;
}

/**
 * Evaluate if rule conditions are met
 */
function evaluateConditions(rule: TaskAssignmentRule, context: TriggerContext): boolean {
	const conditions = rule.conditions;
	if (!conditions) return true;

	const now = context.timestamp || new Date();
	// Use Pacific timezone for all time-based evaluations
	const pacificNow = getPacificDateParts(now);

	// Location check
	if (conditions.locationId && context.locationId !== conditions.locationId) {
		return false;
	}

	// Day of week check (Pacific timezone)
	if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
		if (!conditions.daysOfWeek.includes(pacificNow.weekday)) {
			return false;
		}
	}

	// Time window check (Pacific timezone)
	if (conditions.timeWindowStart || conditions.timeWindowEnd) {
		const currentTime = `${String(pacificNow.hour).padStart(2, '0')}:${String(pacificNow.minute).padStart(2, '0')}`;
		const startTime = conditions.timeWindowStart || '00:00';
		let endTime = conditions.timeWindowEnd || '23:59';

		// Treat "00:00" as end of day (23:59) - common user intent
		if (endTime === '00:00') {
			endTime = '23:59';
		}

		// Handle wrap-around (end < start means overnight range, e.g., "22:00" to "02:00")
		if (endTime < startTime) {
			// For wrap-around: current time must be >= start OR <= end
			if (currentTime < startTime && currentTime > endTime) {
				return false;
			}
		} else {
			// Normal range: current time must be within [start, end]
			if (currentTime < startTime || currentTime > endTime) {
				return false;
			}
		}
	}

	// Role check - need to get user's role
	// This is handled separately if needed

	return true;
}

/**
 * Determine the assignee based on assignment type
 */
async function determineAssignee(
	rule: TaskAssignmentRule,
	context: TriggerContext
): Promise<string | null> {
	const assignmentType = rule.assignmentType;
	const config = rule.assignmentConfig;

	switch (assignmentType) {
		case 'clocked_in_user':
			return context.userId;

		case 'specific_user':
			return config?.userId || null;

		case 'role_rotation':
			return await getNextRotationUser(rule);

		case 'location_staff':
			return await getLocationStaffUser(context.locationId, config?.roles);

		case 'least_tasks':
			return await getUserWithLeastTasks(config?.roles);

		default:
			return context.userId;
	}
}

/**
 * Get next user in rotation
 */
async function getNextRotationUser(rule: TaskAssignmentRule): Promise<string | null> {
	const config = rule.assignmentConfig;
	const roles = config?.roles || ['staff'];

	// Get eligible users
	const eligibleUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.isActive, true), sql`${users.role} = ANY(ARRAY[${sql.raw(roles.map((r) => `'${r}'`).join(','))}]::user_role[])`))
		.orderBy(users.name);

	if (eligibleUsers.length === 0) return null;

	// Get rotation state
	const rotationState = config?.rotationState || { rotationIndex: 0 };
	const nextIndex = (rotationState.rotationIndex || 0) % eligibleUsers.length;
	const nextUser = eligibleUsers[nextIndex];

	// Update rotation state
	await db
		.update(taskAssignmentRules)
		.set({
			assignmentConfig: {
				...config,
				rotationState: {
					lastAssignedUserId: nextUser.id,
					rotationIndex: nextIndex + 1
				}
			},
			updatedAt: new Date()
		})
		.where(eq(taskAssignmentRules.id, rule.id));

	return nextUser.id;
}

/**
 * Get a user from location staff
 */
async function getLocationStaffUser(
	locationId: string | undefined,
	roles?: string[]
): Promise<string | null> {
	if (!locationId) return null;

	// Get users currently clocked in at this location (via their shift)
	const clockedInUsers = await db
		.select({ userId: timeEntries.userId })
		.from(timeEntries)
		.innerJoin(shifts, eq(timeEntries.shiftId, shifts.id))
		.where(and(eq(shifts.locationId, locationId), isNull(timeEntries.clockOut)))
		.limit(1);

	if (clockedInUsers.length > 0) {
		return clockedInUsers[0].userId;
	}

	return null;
}

/**
 * Get user with least active tasks
 */
async function getUserWithLeastTasks(roles?: string[]): Promise<string | null> {
	const roleFilter = roles && roles.length > 0
		? sql`${users.role} = ANY(ARRAY[${sql.raw(roles.map((r) => `'${r}'`).join(','))}]::user_role[])`
		: sql`true`;

	const result = await db
		.select({
			userId: users.id,
			taskCount: sql<number>`COALESCE((
				SELECT COUNT(*)
				FROM tasks
				WHERE tasks.assigned_to = ${users.id}
				AND tasks.status NOT IN ('completed', 'cancelled')
			), 0)`
		})
		.from(users)
		.where(and(eq(users.isActive, true), roleFilter))
		.orderBy(sql`task_count ASC`)
		.limit(1);

	return result[0]?.userId || null;
}

/**
 * Create a task from a rule and template
 */
async function createTaskFromRule(
	rule: TaskAssignmentRule,
	template: TaskTemplate,
	assigneeId: string,
	context: TriggerContext
): Promise<void> {
	// Calculate due date as end of day in Pacific timezone
	const dueAt = getPacificEndOfDay();

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
		linkedEventId: rule.id, // Link to the rule that created it
		createdBy: context.userId
	});
}

/**
 * Create a cash count task from a rule and cash count config
 */
async function createCashCountTaskFromRule(
	rule: TaskAssignmentRule,
	config: CashCountConfig,
	locationName: string | null,
	assigneeId: string,
	context: TriggerContext
): Promise<void> {
	// Calculate due date as end of day in Pacific timezone
	const dueAt = getPacificEndOfDay();

	// Create the task
	const [task] = await db.insert(tasks).values({
		title: `${config.name}${locationName ? ` - ${locationName}` : ''}`,
		description: `Complete the ${config.name.toLowerCase()}. Ensure all denominations are counted accurately.`,
		assignedTo: assigneeId,
		priority: 'high', // Cash counts are high priority
		dueAt,
		status: 'not_started',
		photoRequired: false,
		notesRequired: true,
		source: 'event_triggered',
		linkedEventId: rule.id, // Link to the rule that created it
		createdBy: context.userId
	}).returning({ id: tasks.id });

	// Create the cash count task link so the UI shows the cash count form
	await db.insert(cashCountTaskLinks).values({
		taskId: task.id,
		configId: config.id,
		locationId: config.locationId
	});
}

/**
 * Check if user is first to clock in at location today (Pacific timezone)
 */
export async function isFirstClockInAtLocation(
	userId: string,
	locationId: string
): Promise<boolean> {
	// Use Pacific timezone for "today" boundary
	const startOfDay = getPacificStartOfDay();

	// Check for other clock-ins at this location via shift OR user's primary location
	// Uses COALESCE to check shift.locationId first, then user.primaryLocationId
	const existingClockIns = await db
		.select({ count: sql<number>`count(*)` })
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
		.where(
			and(
				sql`COALESCE(${shifts.locationId}, ${users.primaryLocationId}) = ${locationId}`,
				gte(timeEntries.clockIn, startOfDay),
				ne(timeEntries.userId, userId)
			)
		);

	return (existingClockIns[0]?.count || 0) === 0;
}

/**
 * Check if user is last to clock out at location today
 */
export async function isLastClockOutAtLocation(
	userId: string,
	locationId: string
): Promise<boolean> {
	// Check if there are any other users still clocked in at this location
	// Uses COALESCE to check shift.locationId first, then user.primaryLocationId
	const stillClockedIn = await db
		.select({ count: sql<number>`count(*)` })
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
		.where(
			and(
				sql`COALESCE(${shifts.locationId}, ${users.primaryLocationId}) = ${locationId}`,
				isNull(timeEntries.clockOut),
				ne(timeEntries.userId, userId)
			)
		);

	return (stillClockedIn[0]?.count || 0) === 0;
}

/**
 * Process time-into-shift rules for all active time entries
 * This should be called periodically (e.g., every 15 minutes)
 */
export async function processTimeIntoShiftRules(): Promise<{
	tasksCreated: number;
	errors: string[];
}> {
	const results = { tasksCreated: 0, errors: [] as string[] };

	try {
		// Get all time_into_shift rules
		const rules = await db
			.select({
				rule: taskAssignmentRules,
				template: taskTemplates
			})
			.from(taskAssignmentRules)
			.innerJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
			.where(
				and(
					eq(taskAssignmentRules.triggerType, 'time_into_shift'),
					eq(taskAssignmentRules.isActive, true),
					eq(taskTemplates.isActive, true)
				)
			);

		if (rules.length === 0) return results;

		// Get all active time entries (clocked in but not out)
		const activeEntries = await db
			.select()
			.from(timeEntries)
			.where(isNull(timeEntries.clockOut));

		const now = new Date();

		for (const entry of activeEntries) {
			const hoursWorked = (now.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60);

			for (const { rule, template } of rules) {
				const requiredHours = rule.triggerConfig?.hoursIntoShift;
				if (!requiredHours) continue;

				// Check if we've passed the threshold
				if (hoursWorked < requiredHours) continue;

				// Check if we already created a task for this entry and rule today (Pacific timezone)
				const startOfDay = getPacificStartOfDay();

				const existingTask = await db
					.select({ count: sql<number>`count(*)` })
					.from(tasks)
					.where(
						and(
							eq(tasks.templateId, template.id),
							eq(tasks.assignedTo, entry.userId),
							eq(tasks.linkedEventId, rule.id),
							gte(tasks.createdAt, startOfDay)
						)
					);

				if ((existingTask[0]?.count || 0) > 0) continue;

				// Evaluate conditions
				const context: TriggerContext = {
					userId: entry.userId,
					locationId: entry.locationId || undefined,
					timestamp: now
				};

				if (!evaluateConditions(rule, context)) continue;

				try {
					// Create the task
					await createTaskFromRule(rule, template, entry.userId, context);

					// Update rule stats
					await db
						.update(taskAssignmentRules)
						.set({
							lastTriggeredAt: now,
							triggerCount: sql`${taskAssignmentRules.triggerCount} + 1`,
							updatedAt: now
						})
						.where(eq(taskAssignmentRules.id, rule.id));

					results.tasksCreated++;
				} catch (error) {
					const errMsg = error instanceof Error ? error.message : 'Unknown error';
					results.errors.push(`Error creating time-into-shift task: ${errMsg}`);
				}
			}
		}
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : 'Unknown error';
		results.errors.push(`Error processing time-into-shift rules: ${errMsg}`);
	}

	return results;
}

/**
 * Process closing_shift rules for users currently clocked in
 * This should be called periodically (e.g., every 15 minutes)
 *
 * The closing_shift trigger creates tasks for users who are clocked in
 * when the configured trigger time is reached (e.g., 8:30 PM closing tasks)
 */
export async function processClosingShiftRules(): Promise<{
	tasksCreated: number;
	errors: string[];
}> {
	const results = { tasksCreated: 0, errors: [] as string[] };

	try {
		// Get current time in Pacific timezone
		const now = new Date();
		const pacificNow = getPacificDateParts(now);
		const startOfDay = getPacificStartOfDay();

		// Get all closing_shift rules
		const rules = await db
			.select({
				rule: taskAssignmentRules,
				template: taskTemplates,
				cashCountConfig: cashCountConfigs,
				locationName: locations.name
			})
			.from(taskAssignmentRules)
			.leftJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
			.leftJoin(cashCountConfigs, eq(taskAssignmentRules.cashCountConfigId, cashCountConfigs.id))
			.leftJoin(locations, eq(cashCountConfigs.locationId, locations.id))
			.where(
				and(
					eq(taskAssignmentRules.triggerType, 'closing_shift'),
					eq(taskAssignmentRules.isActive, true),
					or(
						and(
							isNull(taskAssignmentRules.cashCountConfigId),
							eq(taskTemplates.isActive, true)
						),
						and(
							isNull(taskAssignmentRules.templateId),
							eq(cashCountConfigs.isActive, true)
						)
					)
				)
			);

		if (rules.length === 0) return results;

		for (const { rule, template, cashCountConfig, locationName } of rules) {
			try {
				// Get the trigger time from config (e.g., "20:30" for 8:30 PM)
				const triggerTime = rule.triggerConfig?.triggerTime as string;
				if (!triggerTime) continue;

				// Check if we're within 15 minutes after the trigger time
				// This allows some flexibility for the cron job timing
				const [triggerHour, triggerMinute] = triggerTime.split(':').map(Number);
				const triggerMinutes = triggerHour * 60 + triggerMinute;
				const currentMinutes = pacificNow.hour * 60 + pacificNow.minute;

				// Only process if current time is between trigger time and trigger time + 15 minutes
				if (currentMinutes < triggerMinutes || currentMinutes > triggerMinutes + 15) {
					continue;
				}

				// Check conditions (days of week, location, etc.)
				const context: TriggerContext = {
					userId: '', // Will be set per user
					locationId: rule.conditions?.locationId as string | undefined,
					timestamp: now
				};

				if (!evaluateConditions(rule, context)) continue;

				// Get all users currently clocked in at the location (if specified)
				// Join with shifts and users to get location from shift or user's primary location
				const ruleLocationId = rule.conditions?.locationId as string | undefined;

				const clockedInUsersQuery = db
					.select({
						userId: timeEntries.userId,
						locationId: sql<string>`COALESCE(${shifts.locationId}, ${users.primaryLocationId})`
					})
					.from(timeEntries)
					.innerJoin(users, eq(timeEntries.userId, users.id))
					.leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
					.where(isNull(timeEntries.clockOut));

				const clockedInUsers = await clockedInUsersQuery;

				// Filter by location if rule specifies one
				const filteredUsers = ruleLocationId
					? clockedInUsers.filter(u => u.locationId === ruleLocationId)
					: clockedInUsers;

				if (filteredUsers.length === 0) continue;

				for (const entry of filteredUsers) {
					// Check if we already created a task for this user and rule today
					const existingTask = await db
						.select({ count: sql<number>`count(*)` })
						.from(tasks)
						.where(
							and(
								eq(tasks.assignedTo, entry.userId),
								eq(tasks.linkedEventId, rule.id),
								gte(tasks.createdAt, startOfDay)
							)
						);

					if ((existingTask[0]?.count || 0) > 0) continue;

					// Create the task
					const userContext: TriggerContext = {
						userId: entry.userId,
						locationId: entry.locationId || undefined,
						timestamp: now
					};

					if (cashCountConfig) {
						await createCashCountTaskFromRule(rule, cashCountConfig, locationName, entry.userId, userContext);
					} else if (template) {
						await createTaskFromRule(rule, template, entry.userId, userContext);
					} else {
						continue;
					}

					// Update rule stats
					await db
						.update(taskAssignmentRules)
						.set({
							lastTriggeredAt: now,
							triggerCount: sql`${taskAssignmentRules.triggerCount} + 1`,
							updatedAt: now
						})
						.where(eq(taskAssignmentRules.id, rule.id));

					results.tasksCreated++;
				}
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : 'Unknown error';
				results.errors.push(`Error processing closing-shift rule ${rule.name}: ${errMsg}`);
			}
		}
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : 'Unknown error';
		results.errors.push(`Error processing closing-shift rules: ${errMsg}`);
	}

	return results;
}
