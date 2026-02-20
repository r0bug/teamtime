// Clock User Tool - Clock a user in or out right now with full side-effect chain
import { db, users, timeEntries, shifts } from '$lib/server/db';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRequiredUserId, validateLocationId } from '../utils/validation';
import { processRulesForTrigger, isFirstClockInAtLocation, isLastClockOutAtLocation } from '$lib/server/services/task-rules';
import { awardClockInPoints, awardClockOutPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';
import { auditClockEvent } from '$lib/server/services/audit-service';
import { getPacificStartOfDay } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:clock-user');

interface ClockUserParams {
	userId: string;
	action: 'in' | 'out';
	locationId?: string;
	notes?: string;
}

interface ClockUserResult {
	success: boolean;
	userName?: string;
	action?: 'clock_in' | 'clock_out';
	timeEntryId?: string;
	clockTime?: string;
	pointsAwarded?: number;
	tasksCreated?: number;
	isFirstIn?: boolean;
	isLastOut?: boolean;
	error?: string;
}

export const clockUserTool: AITool<ClockUserParams, ClockUserResult> = {
	name: 'clock_user',
	description: 'Clock a user in or out right now. Triggers full side effects: points, task rules, achievements, and audit logging. Use get_available_staff to look up user IDs first.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user ID to clock in/out'
			},
			action: {
				type: 'string',
				enum: ['in', 'out'],
				description: 'Whether to clock the user in or out'
			},
			locationId: {
				type: 'string',
				description: 'Optional location ID for the clock event'
			},
			notes: {
				type: 'string',
				description: 'Optional notes for the time entry'
			}
		},
		required: ['userId', 'action']
	},

	requiresConfirmation: true,
	requiresApproval: false,
	cooldown: {
		perUser: 5
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: ClockUserParams): string {
		return `Clock ${params.action === 'in' ? 'in' : 'out'} user ${params.userId}?`;
	},

	validate(params: ClockUserParams) {
		const userValidation = validateRequiredUserId(params.userId, 'userId');
		if (!userValidation.valid) return userValidation;

		if (params.action !== 'in' && params.action !== 'out') {
			return { valid: false, error: 'action must be "in" or "out"' };
		}

		const locValidation = validateLocationId(params.locationId);
		if (!locValidation.valid) return locValidation;

		if (params.notes && params.notes.length > 500) {
			return { valid: false, error: 'Notes must be under 500 characters' };
		}

		return { valid: true };
	},

	async execute(params: ClockUserParams, context: ToolExecutionContext): Promise<ClockUserResult> {
		if (context.dryRun) {
			return { success: true, action: params.action === 'in' ? 'clock_in' : 'clock_out', error: 'Dry run - no changes made' };
		}

		try {
			// Get user info
			const [user] = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive, primaryLocationId: users.primaryLocationId })
				.from(users)
				.where(eq(users.id, params.userId));

			if (!user) return { success: false, error: 'User not found' };
			if (!user.isActive) return { success: false, error: 'Cannot clock inactive user' };

			const locationId = params.locationId || user.primaryLocationId || undefined;
			const now = new Date();

			if (params.action === 'in') {
				return await clockIn(user, locationId, now, params.notes, context);
			} else {
				return await clockOut(user, locationId, now, params.notes, context);
			}
		} catch (error) {
			log.error({ error, params }, 'Clock user tool error');
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ClockUserResult): string {
		if (!result.success) return `Failed to clock user: ${result.error}`;

		let msg = `${result.userName} clocked ${result.action === 'clock_in' ? 'in' : 'out'} at ${result.clockTime}`;
		if (result.pointsAwarded) msg += ` (+${result.pointsAwarded} points)`;
		if (result.tasksCreated) msg += `, ${result.tasksCreated} task(s) created`;
		if (result.isFirstIn) msg += ' (first in today)';
		if (result.isLastOut) msg += ' (last out today)';
		return msg;
	}
};

async function clockIn(
	user: { id: string; name: string; primaryLocationId: string | null },
	locationId: string | undefined,
	now: Date,
	notes: string | undefined,
	context: ToolExecutionContext
): Promise<ClockUserResult> {
	// Check not already clocked in
	const [activeEntry] = await db
		.select({ id: timeEntries.id })
		.from(timeEntries)
		.where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
		.limit(1);

	if (activeEntry) {
		return { success: false, error: `${user.name} is already clocked in (entry: ${activeEntry.id})` };
	}

	// Find today's shift for this user
	const dayStart = getPacificStartOfDay(now);
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
	const [todayShift] = await db
		.select({ id: shifts.id, locationId: shifts.locationId })
		.from(shifts)
		.where(and(eq(shifts.userId, user.id), gte(shifts.startTime, dayStart), lte(shifts.startTime, dayEnd)))
		.limit(1);

	const effectiveLocationId = locationId || todayShift?.locationId || undefined;

	// Insert time entry
	const [entry] = await db
		.insert(timeEntries)
		.values({
			userId: user.id,
			clockIn: now,
			shiftId: todayShift?.id || null,
			locationId: effectiveLocationId || null,
			notes: notes ? `[AI clock-in] ${notes}` : '[AI clock-in]'
		})
		.returning({ id: timeEntries.id });

	// Check first clock-in
	let isFirstIn = false;
	if (effectiveLocationId) {
		isFirstIn = await isFirstClockInAtLocation(user.id, effectiveLocationId);
	}

	// Process task rules
	const triggerEvent = isFirstIn ? 'first_clock_in' as const : 'clock_in' as const;
	const ruleResults = await processRulesForTrigger(triggerEvent, {
		userId: user.id,
		locationId: effectiveLocationId,
		timestamp: now
	});

	// Award points
	const pointResult = await awardClockInPoints(user.id, entry.id, now);

	// Check achievements
	await checkAndAwardAchievements(user.id);

	// Audit
	await auditClockEvent({
		userId: user.id,
		timeEntryId: entry.id,
		action: 'clock_in',
		locationId: effectiveLocationId
	});

	log.info({ userId: user.id, userName: user.name, timeEntryId: entry.id, runId: context.runId }, 'AI clocked user in');

	return {
		success: true,
		userName: user.name,
		action: 'clock_in',
		timeEntryId: entry.id,
		clockTime: now.toISOString(),
		pointsAwarded: pointResult.points,
		tasksCreated: ruleResults.tasksCreated,
		isFirstIn
	};
}

async function clockOut(
	user: { id: string; name: string; primaryLocationId: string | null },
	locationId: string | undefined,
	now: Date,
	notes: string | undefined,
	context: ToolExecutionContext
): Promise<ClockUserResult> {
	// Find active entry
	const [activeEntry] = await db
		.select({
			id: timeEntries.id,
			clockIn: timeEntries.clockIn,
			shiftId: timeEntries.shiftId,
			locationId: timeEntries.locationId
		})
		.from(timeEntries)
		.where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
		.limit(1);

	if (!activeEntry) {
		return { success: false, error: `${user.name} is not currently clocked in` };
	}

	const effectiveLocationId = locationId || activeEntry.locationId || user.primaryLocationId || undefined;

	// Check last clock-out BEFORE updating
	let isLastOut = false;
	if (effectiveLocationId) {
		isLastOut = await isLastClockOutAtLocation(user.id, effectiveLocationId);
	}

	// Update the entry
	await db
		.update(timeEntries)
		.set({
			clockOut: now,
			notes: notes ? `[AI clock-out] ${notes}` : '[AI clock-out]',
			updatedAt: now
		})
		.where(eq(timeEntries.id, activeEntry.id));

	// Process task rules
	const triggerEvent = isLastOut ? 'last_clock_out' as const : 'clock_out' as const;
	const ruleResults = await processRulesForTrigger(triggerEvent, {
		userId: user.id,
		locationId: effectiveLocationId,
		timestamp: now
	});

	// Award points (normal clock-out, not force-out)
	const pointResult = await awardClockOutPoints(user.id, activeEntry.id, true);

	// Check achievements
	await checkAndAwardAchievements(user.id);

	// Audit
	await auditClockEvent({
		userId: user.id,
		timeEntryId: activeEntry.id,
		action: 'clock_out',
		locationId: effectiveLocationId
	});

	log.info({ userId: user.id, userName: user.name, timeEntryId: activeEntry.id, runId: context.runId }, 'AI clocked user out');

	return {
		success: true,
		userName: user.name,
		action: 'clock_out',
		timeEntryId: activeEntry.id,
		clockTime: now.toISOString(),
		pointsAwarded: pointResult.points,
		tasksCreated: ruleResults.tasksCreated,
		isLastOut
	};
}
