// Update Schedule Tool - Modify an existing shift
import { db, shifts, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';
import { toPacificDateString, toPacificTimeString, createPacificDateTime } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:update-schedule');

interface UpdateScheduleParams {
	shiftId: string;
	date?: string;          // YYYY-MM-DD (moves shift to new date)
	startTime?: string;     // HH:MM
	endTime?: string;       // HH:MM
	locationId?: string;
	notes?: string;
}

interface UpdateScheduleResult {
	success: boolean;
	shiftId?: string;
	userName?: string;
	changes?: string[];
	error?: string;
}

export const updateScheduleTool: AITool<UpdateScheduleParams, UpdateScheduleResult> = {
	name: 'update_schedule',
	description: 'Modify an existing shift - change times, date, location, or notes. Use when adjusting a schedule without fully deleting and recreating.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			shiftId: {
				type: 'string',
				description: 'The ID of the shift to update'
			},
			date: {
				type: 'string',
				description: 'New date for the shift (YYYY-MM-DD format). Moves entire shift to new date.'
			},
			startTime: {
				type: 'string',
				description: 'New start time (HH:MM format in Pacific time)'
			},
			endTime: {
				type: 'string',
				description: 'New end time (HH:MM format in Pacific time)'
			},
			locationId: {
				type: 'string',
				description: 'New location ID'
			},
			notes: {
				type: 'string',
				description: 'Notes to add or update on the shift'
			}
		},
		required: ['shiftId']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 5
	},
	rateLimit: {
		maxPerHour: 30
	},

	getConfirmationMessage(params: UpdateScheduleParams): string {
		const changes: string[] = [];
		if (params.date) changes.push(`date to ${params.date}`);
		if (params.startTime) changes.push(`start to ${params.startTime}`);
		if (params.endTime) changes.push(`end to ${params.endTime}`);
		if (params.locationId) changes.push('location');
		if (params.notes) changes.push('notes');
		return `Update shift ${params.shiftId}? Changes: ${changes.join(', ') || 'none specified'}`;
	},

	validate(params: UpdateScheduleParams) {
		if (!params.shiftId || params.shiftId.trim().length === 0) {
			return { valid: false, error: 'Shift ID is required' };
		}
		if (!isValidUUID(params.shiftId)) {
			return { valid: false, error: `Invalid shiftId format: "${params.shiftId}". Expected a UUID.` };
		}

		// Must have at least one change
		if (!params.date && !params.startTime && !params.endTime && !params.locationId && params.notes === undefined) {
			return { valid: false, error: 'At least one field to update is required' };
		}

		// Validate date format
		if (params.date && !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
			return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
		}

		// Validate time formats
		if (params.startTime && !/^\d{2}:\d{2}$/.test(params.startTime)) {
			return { valid: false, error: 'Start time must be in HH:MM format' };
		}
		if (params.endTime && !/^\d{2}:\d{2}$/.test(params.endTime)) {
			return { valid: false, error: 'End time must be in HH:MM format' };
		}

		if (params.locationId && !isValidUUID(params.locationId)) {
			return { valid: false, error: 'Invalid locationId format' };
		}

		if (params.notes && params.notes.length > 500) {
			return { valid: false, error: 'Notes too long (max 500 chars)' };
		}

		return { valid: true };
	},

	async execute(params: UpdateScheduleParams, context: ToolExecutionContext): Promise<UpdateScheduleResult> {
		if (context.dryRun) {
			return {
				success: true,
				shiftId: params.shiftId,
				error: 'Dry run - shift would be updated'
			};
		}

		try {
			// Get the existing shift
			const [shift] = await db
				.select({
					id: shifts.id,
					userId: shifts.userId,
					startTime: shifts.startTime,
					endTime: shifts.endTime,
					locationId: shifts.locationId,
					notes: shifts.notes
				})
				.from(shifts)
				.where(eq(shifts.id, params.shiftId))
				.limit(1);

			if (!shift) {
				return { success: false, error: 'Shift not found' };
			}

			// Get user name
			const [user] = await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, shift.userId))
				.limit(1);

			// Verify location if provided
			if (params.locationId) {
				const [loc] = await db
					.select({ id: locations.id })
					.from(locations)
					.where(eq(locations.id, params.locationId))
					.limit(1);
				if (!loc) {
					return { success: false, error: 'Location not found' };
				}
			}

			// Build the update object
			const updates: Partial<typeof shift> & { updatedAt: Date } = {
				updatedAt: new Date()
			};
			const changes: string[] = [];

			// Handle date/time changes
			const currentDate = toPacificDateString(shift.startTime);
			const currentStartTime = toPacificTimeString(shift.startTime);
			const currentEndTime = toPacificTimeString(shift.endTime);

			const newDate = params.date || currentDate;
			const newStartTime = params.startTime || currentStartTime;
			const newEndTime = params.endTime || currentEndTime;

			// Only update times if something changed
			if (params.date || params.startTime) {
				const [startHour, startMinute] = newStartTime.split(':').map(Number);
				const newStartDateTime = createPacificDateTime(newDate, startHour, startMinute);
				updates.startTime = newStartDateTime;
				if (params.date) changes.push(`date: ${currentDate} -> ${newDate}`);
				if (params.startTime) changes.push(`start: ${currentStartTime} -> ${newStartTime}`);
			}

			if (params.date || params.endTime) {
				let endDate = newDate;
				// Handle overnight shifts
				if (newEndTime < newStartTime) {
					const d = new Date(newDate);
					d.setDate(d.getDate() + 1);
					endDate = toPacificDateString(d);
				}
				const [endHour, endMinute] = newEndTime.split(':').map(Number);
				const newEndDateTime = createPacificDateTime(endDate, endHour, endMinute);
				updates.endTime = newEndDateTime;
				if (params.endTime) changes.push(`end: ${currentEndTime} -> ${newEndTime}`);
			}

			if (params.locationId !== undefined) {
				updates.locationId = params.locationId || null;
				changes.push('location updated');
			}

			if (params.notes !== undefined) {
				updates.notes = params.notes || null;
				changes.push('notes updated');
			}

			// Apply updates
			await db
				.update(shifts)
				.set(updates)
				.where(eq(shifts.id, params.shiftId));

			log.info({
			shiftId: params.shiftId,
			userId: shift.userId,
			changes
		}, 'Shift updated by Office Manager');

			return {
				success: true,
				shiftId: params.shiftId,
				userName: user?.name,
				changes
			};
		} catch (error) {
			log.error({ error }, 'Update schedule tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: UpdateScheduleResult): string {
		if (result.success) {
			const user = result.userName ? ` for ${result.userName}` : '';
			const changeList = result.changes?.length ? `\nChanges: ${result.changes.join(', ')}` : '';
			return `Shift${user} updated successfully.${changeList}`;
		}
		return `Failed to update shift: ${result.error}`;
	}
};
