// Trade Shifts Tool - Swap a shift between two users
import { db, shifts, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRequiredUserId, isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:trade-shifts');

interface TradeShiftsParams {
	shiftId: string;
	fromUserId: string;
	toUserId: string;
	reason?: string;
}

interface TradeShiftsResult {
	success: boolean;
	shiftId?: string;
	fromUserName?: string;
	toUserName?: string;
	shiftDate?: string;
	error?: string;
}

export const tradeShiftsTool: AITool<TradeShiftsParams, TradeShiftsResult> = {
	name: 'trade_shifts',
	description: 'Reassign a shift from one user to another. Use when staff need to swap shifts or when coverage needs to change. Both users should ideally be informed.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			shiftId: {
				type: 'string',
				description: 'The ID of the shift to reassign'
			},
			fromUserId: {
				type: 'string',
				description: 'The current owner of the shift'
			},
			toUserId: {
				type: 'string',
				description: 'The user who will take over the shift'
			},
			reason: {
				type: 'string',
				description: 'Optional reason for the shift trade'
			}
		},
		required: ['shiftId', 'fromUserId', 'toUserId']
	},

	requiresApproval: false,
	requiresConfirmation: true, // Requires user confirmation

	cooldown: {
		perUser: 30, // Don't trade same shift more than once per 30 min
		global: 10 // Don't trade more than once every 10 min globally
	},
	rateLimit: {
		maxPerHour: 10
	},

	getConfirmationMessage(params: TradeShiftsParams): string {
		let msg = `Reassign shift ${params.shiftId}?`;
		if (params.reason) {
			msg += `\n\nReason: ${params.reason}`;
		}
		return msg;
	},

	validate(params: TradeShiftsParams) {
		if (!params.shiftId) {
			return { valid: false, error: 'Shift ID is required' };
		}
		// Validate shift ID format
		if (!isValidUUID(params.shiftId)) {
			return {
				valid: false,
				error: `Invalid shiftId format: "${params.shiftId}". Expected a UUID.`
			};
		}
		// Validate fromUserId format
		const fromUserIdValidation = validateRequiredUserId(params.fromUserId, 'fromUserId');
		if (!fromUserIdValidation.valid) {
			return fromUserIdValidation;
		}
		// Validate toUserId format
		const toUserIdValidation = validateRequiredUserId(params.toUserId, 'toUserId');
		if (!toUserIdValidation.valid) {
			return toUserIdValidation;
		}
		if (params.fromUserId === params.toUserId) {
			return { valid: false, error: 'Cannot trade a shift to the same user' };
		}
		return { valid: true };
	},

	async execute(params: TradeShiftsParams, context: ToolExecutionContext): Promise<TradeShiftsResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - shift would be traded'
			};
		}

		try {
			// Get the shift
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

			// Verify the shift belongs to fromUserId
			if (shift[0].userId !== params.fromUserId) {
				return { success: false, error: 'Shift does not belong to the specified from user' };
			}

			// Verify toUserId exists and is active
			const toUser = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, params.toUserId))
				.limit(1);

			if (toUser.length === 0) {
				return { success: false, error: 'Target user not found' };
			}

			if (!toUser[0].isActive) {
				return { success: false, error: 'Target user is not active' };
			}

			// Get fromUser name
			const fromUser = await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, params.fromUserId))
				.limit(1);

			// Update the shift
			await db
				.update(shifts)
				.set({
					userId: params.toUserId,
					notes: params.reason
						? `Traded from ${fromUser[0]?.name || 'unknown'}: ${params.reason}`
						: `Traded from ${fromUser[0]?.name || 'unknown'}`,
					updatedAt: new Date()
				})
				.where(eq(shifts.id, params.shiftId));

			return {
				success: true,
				shiftId: params.shiftId,
				fromUserName: fromUser[0]?.name,
				toUserName: toUser[0].name,
				shiftDate: shift[0].startTime.toISOString().split('T')[0]
			};
		} catch (error) {
			log.error({ error }, 'Trade shifts tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: TradeShiftsResult): string {
		if (result.success) {
			return `Shift traded from ${result.fromUserName || 'user'} to ${result.toUserName || 'user'} for ${result.shiftDate}`;
		}
		return `Failed to trade shift: ${result.error}`;
	}
};
