// Delete Schedule Tool - Allows AI to delete scheduled shifts
import { db, shifts, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:delete-schedule');

interface DeleteScheduleParams {
	shiftId: string;
	reason?: string;
	notifyUser?: boolean;
}

interface DeleteScheduleResult {
	success: boolean;
	shiftId?: string;
	deletedUserName?: string;
	shiftDate?: string;
	shiftTime?: string;
	error?: string;
}

export const deleteScheduleTool: AITool<DeleteScheduleParams, DeleteScheduleResult> = {
	name: 'delete_schedule',
	description: 'Delete a scheduled shift. Use when a shift is no longer needed, was created in error, or needs to be removed. The affected user can optionally be notified.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			shiftId: {
				type: 'string',
				description: 'The ID of the shift to delete (UUID format)'
			},
			reason: {
				type: 'string',
				description: 'Optional reason for deleting the shift'
			},
			notifyUser: {
				type: 'boolean',
				description: 'Whether to notify the assigned user about the deletion (default: false)'
			}
		},
		required: ['shiftId']
	},

	requiresApproval: false,
	requiresConfirmation: true, // Destructive action - requires confirmation

	cooldown: {
		global: 5 // Don't delete shifts too rapidly
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: DeleteScheduleParams): string {
		let msg = `Delete shift ${params.shiftId}?`;
		if (params.reason) {
			msg += `\n\nReason: ${params.reason}`;
		}
		if (params.notifyUser) {
			msg += '\n\nThe assigned user will be notified.';
		}
		return msg;
	},

	validate(params: DeleteScheduleParams) {
		if (!params.shiftId) {
			return { valid: false, error: 'Shift ID is required' };
		}
		if (!isValidUUID(params.shiftId)) {
			return {
				valid: false,
				error: `Invalid shiftId format: "${params.shiftId}". Expected a UUID.`
			};
		}
		if (params.reason && params.reason.length > 500) {
			return { valid: false, error: 'Reason too long (max 500 characters)' };
		}
		return { valid: true };
	},

	async execute(params: DeleteScheduleParams, context: ToolExecutionContext): Promise<DeleteScheduleResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - shift would be deleted'
			};
		}

		try {
			// Fetch the shift to verify it exists and get details
			const shift = await db
				.select({
					id: shifts.id,
					userId: shifts.userId,
					startTime: shifts.startTime,
					endTime: shifts.endTime
				})
				.from(shifts)
				.where(eq(shifts.id, params.shiftId))
				.limit(1);

			if (shift.length === 0) {
				return { success: false, error: 'Shift not found' };
			}

			// Get the user name for the result
			const user = await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, shift[0].userId))
				.limit(1);

			const userName = user[0]?.name || 'Unknown user';
			const shiftDate = shift[0].startTime.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			const shiftTime = `${shift[0].startTime.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			})} - ${shift[0].endTime.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			})}`;

			// Delete the shift
			await db.delete(shifts).where(eq(shifts.id, params.shiftId));

			log.info({
				shiftId: params.shiftId,
				userId: shift[0].userId,
				userName,
				reason: params.reason
			}, 'Shift deleted');

			// TODO: If notifyUser is true, send notification to the user
			// This could be implemented by calling the sendMessageTool internally

			return {
				success: true,
				shiftId: params.shiftId,
				deletedUserName: userName,
				shiftDate,
				shiftTime
			};
		} catch (error) {
			log.error({ error }, 'Delete schedule tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: DeleteScheduleResult): string {
		if (result.success) {
			return `Deleted shift for ${result.deletedUserName} on ${result.shiftDate} (${result.shiftTime})`;
		}
		return `Failed to delete shift: ${result.error}`;
	}
};
