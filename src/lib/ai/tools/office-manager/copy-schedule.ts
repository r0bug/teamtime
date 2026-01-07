// Copy Schedule Tool - Copy a week of shifts to another week
import { db, shifts, users } from '$lib/server/db';
import { and, gte, lt, eq, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';
import { parsePacificDate, toPacificDateString, toPacificTimeString, createPacificDateTime } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:copy-schedule');

interface CopyScheduleParams {
	sourceWeekStart: string;  // YYYY-MM-DD (should be a Monday or Sunday)
	targetWeekStart: string;  // YYYY-MM-DD
	locationId?: string;      // Only copy shifts at this location
	userIds?: string[];       // Only copy shifts for these users
}

interface CopiedShift {
	userName: string;
	date: string;
	times: string;
}

interface CopyScheduleResult {
	success: boolean;
	copiedCount: number;
	skippedCount: number;
	shifts?: CopiedShift[];
	error?: string;
}

export const copyScheduleTool: AITool<CopyScheduleParams, CopyScheduleResult> = {
	name: 'copy_schedule',
	description: 'Copy a week of shifts to another week. Useful for repeating schedules. Can optionally filter by location or specific users.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			sourceWeekStart: {
				type: 'string',
				description: 'Start date of the week to copy from (YYYY-MM-DD, typically a Sunday or Monday)'
			},
			targetWeekStart: {
				type: 'string',
				description: 'Start date of the week to copy to (YYYY-MM-DD)'
			},
			locationId: {
				type: 'string',
				description: 'Optional: Only copy shifts at this location'
			},
			userIds: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional: Only copy shifts for these specific users'
			}
		},
		required: ['sourceWeekStart', 'targetWeekStart']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 60 // Don't copy schedules too frequently
	},
	rateLimit: {
		maxPerHour: 5
	},

	getConfirmationMessage(params: CopyScheduleParams): string {
		let msg = `Copy shifts from week of ${params.sourceWeekStart} to week of ${params.targetWeekStart}?`;
		if (params.locationId) msg += '\n(Filtered by location)';
		if (params.userIds?.length) msg += `\n(Filtered to ${params.userIds.length} user(s))`;
		return msg;
	},

	validate(params: CopyScheduleParams) {
		if (!params.sourceWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(params.sourceWeekStart)) {
			return { valid: false, error: 'sourceWeekStart must be in YYYY-MM-DD format' };
		}
		if (!params.targetWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(params.targetWeekStart)) {
			return { valid: false, error: 'targetWeekStart must be in YYYY-MM-DD format' };
		}
		if (params.sourceWeekStart === params.targetWeekStart) {
			return { valid: false, error: 'Source and target weeks must be different' };
		}
		if (params.locationId && !isValidUUID(params.locationId)) {
			return { valid: false, error: 'Invalid locationId format' };
		}
		if (params.userIds) {
			for (const userId of params.userIds) {
				if (!isValidUUID(userId)) {
					return { valid: false, error: `Invalid userId format: ${userId}` };
				}
			}
		}
		return { valid: true };
	},

	async execute(params: CopyScheduleParams, context: ToolExecutionContext): Promise<CopyScheduleResult> {
		if (context.dryRun) {
			return {
				success: true,
				copiedCount: 0,
				skippedCount: 0,
				error: 'Dry run - shifts would be copied'
			};
		}

		try {
			// Parse dates
			const sourceStart = parsePacificDate(params.sourceWeekStart);
			const sourceEnd = new Date(sourceStart);
			sourceEnd.setDate(sourceEnd.getDate() + 7);

			const targetStart = parsePacificDate(params.targetWeekStart);
			const daysDiff = Math.round((targetStart.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));

			// Build query for source shifts
			const conditions = [
				gte(shifts.startTime, sourceStart),
				lt(shifts.startTime, sourceEnd)
			];

			if (params.locationId) {
				conditions.push(eq(shifts.locationId, params.locationId));
			}

			if (params.userIds?.length) {
				conditions.push(sql`${shifts.userId} IN (${sql.join(params.userIds.map(id => sql`${id}`), sql`, `)})`);
			}

			// Get source shifts
			const sourceShifts = await db
				.select({
					userId: shifts.userId,
					locationId: shifts.locationId,
					startTime: shifts.startTime,
					endTime: shifts.endTime,
					notes: shifts.notes
				})
				.from(shifts)
				.where(and(...conditions));

			if (sourceShifts.length === 0) {
				return {
					success: true,
					copiedCount: 0,
					skippedCount: 0,
					error: 'No shifts found in source week matching criteria'
				};
			}

			// Get user names for reporting
			const userIds = [...new Set(sourceShifts.map(s => s.userId))];
			const usersList = await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
			const userMap = new Map(usersList.map(u => [u.id, u.name]));

			// Check for existing shifts in target week to avoid duplicates
			const targetEnd = new Date(targetStart);
			targetEnd.setDate(targetEnd.getDate() + 7);

			const existingTargetShifts = await db
				.select({
					userId: shifts.userId,
					startTime: shifts.startTime
				})
				.from(shifts)
				.where(and(
					gte(shifts.startTime, targetStart),
					lt(shifts.startTime, targetEnd)
				));

			// Create a set of existing shift keys for quick lookup
			const existingKeys = new Set(
				existingTargetShifts.map(s => `${s.userId}-${toPacificDateString(s.startTime)}-${toPacificTimeString(s.startTime)}`)
			);

			// Create new shifts
			const newShifts: typeof sourceShifts = [];
			const copiedInfo: CopiedShift[] = [];
			let skippedCount = 0;

			for (const shift of sourceShifts) {
				// Calculate new times by adding day difference
				const newStartTime = new Date(shift.startTime.getTime() + daysDiff * 24 * 60 * 60 * 1000);
				const newEndTime = new Date(shift.endTime.getTime() + daysDiff * 24 * 60 * 60 * 1000);

				// Check for duplicate
				const key = `${shift.userId}-${toPacificDateString(newStartTime)}-${toPacificTimeString(newStartTime)}`;
				if (existingKeys.has(key)) {
					skippedCount++;
					continue;
				}

				newShifts.push({
					userId: shift.userId,
					locationId: shift.locationId,
					startTime: newStartTime,
					endTime: newEndTime,
					notes: shift.notes
				});

				copiedInfo.push({
					userName: userMap.get(shift.userId) || 'Unknown',
					date: toPacificDateString(newStartTime),
					times: `${toPacificTimeString(newStartTime)} - ${toPacificTimeString(newEndTime)}`
				});
			}

			// Insert new shifts
			if (newShifts.length > 0) {
				await db.insert(shifts).values(newShifts);
			}

			log.info({
			sourceWeek: params.sourceWeekStart,
			targetWeek: params.targetWeekStart,
			copiedCount: newShifts.length,
			skippedCount
		}, 'Schedule copied by Office Manager');

			return {
				success: true,
				copiedCount: newShifts.length,
				skippedCount,
				shifts: copiedInfo.slice(0, 20) // Limit to first 20 for display
			};
		} catch (error) {
			log.error({ error }, 'Copy schedule tool error');
			return {
				success: false,
				copiedCount: 0,
				skippedCount: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CopyScheduleResult): string {
		if (!result.success) {
			return `Failed to copy schedule: ${result.error}`;
		}

		if (result.copiedCount === 0 && result.skippedCount === 0) {
			return result.error || 'No shifts to copy.';
		}

		let msg = `Copied ${result.copiedCount} shift(s)`;
		if (result.skippedCount > 0) {
			msg += `, skipped ${result.skippedCount} duplicate(s)`;
		}
		msg += '.';

		if (result.shifts && result.shifts.length > 0) {
			msg += '\n\nShifts created:';
			for (const shift of result.shifts.slice(0, 10)) {
				msg += `\n- ${shift.userName}: ${shift.date} ${shift.times}`;
			}
			if (result.shifts.length > 10) {
				msg += `\n... and ${result.shifts.length - 10} more`;
			}
		}

		return msg;
	}
};
