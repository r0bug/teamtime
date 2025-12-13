// Create Schedule Tool - Bulk create shift assignments
import { db, shifts, users, locations } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { createPacificDateTime } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:create-schedule');

interface ShiftAssignment {
	userId: string;
	date: string; // YYYY-MM-DD
	startTime: string; // HH:MM
	endTime: string; // HH:MM
	locationId?: string;
	notes?: string;
}

interface CreateScheduleParams {
	assignments: ShiftAssignment[];
	weekStartDate?: string; // For reference
}

interface CreateScheduleResult {
	success: boolean;
	createdCount?: number;
	failedCount?: number;
	assignments?: {
		userId: string;
		userName: string;
		date: string;
		times: string;
	}[];
	errors?: string[];
	error?: string;
}

export const createScheduleTool: AITool<CreateScheduleParams, CreateScheduleResult> = {
	name: 'create_schedule',
	description: 'Create multiple shift assignments at once. Use for building a weekly schedule or staffing multiple days. Each assignment specifies a user, date, and shift times.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			assignments: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						userId: { type: 'string' },
						date: { type: 'string', description: 'YYYY-MM-DD format' },
						startTime: { type: 'string', description: 'HH:MM format (24h)' },
						endTime: { type: 'string', description: 'HH:MM format (24h)' },
						locationId: { type: 'string' },
						notes: { type: 'string' }
					},
					required: ['userId', 'date', 'startTime', 'endTime']
				},
				description: 'Array of shift assignments to create'
			},
			weekStartDate: {
				type: 'string',
				description: 'Optional reference for which week this schedule covers'
			}
		},
		required: ['assignments']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		global: 60 // Only create schedules once per hour
	},
	rateLimit: {
		maxPerHour: 3
	},

	getConfirmationMessage(params: CreateScheduleParams): string {
		const count = params.assignments.length;
		const dates = [...new Set(params.assignments.map(a => a.date))].sort();

		let msg = `Create ${count} shift assignment${count > 1 ? 's' : ''}?\n\n`;
		msg += `Dates covered: ${dates[0]}`;
		if (dates.length > 1) {
			msg += ` to ${dates[dates.length - 1]}`;
		}
		msg += `\n\nAssignments:\n`;

		// Group by date for readability
		const byDate: Record<string, ShiftAssignment[]> = {};
		params.assignments.forEach(a => {
			if (!byDate[a.date]) byDate[a.date] = [];
			byDate[a.date].push(a);
		});

		Object.keys(byDate).sort().forEach(date => {
			msg += `\n${date}:\n`;
			byDate[date].forEach(a => {
				msg += `  - User ${a.userId.slice(0, 8)}... ${a.startTime}-${a.endTime}\n`;
			});
		});

		return msg;
	},

	validate(params: CreateScheduleParams) {
		if (!params.assignments || params.assignments.length === 0) {
			return { valid: false, error: 'At least one assignment is required' };
		}

		if (params.assignments.length > 50) {
			return { valid: false, error: 'Maximum 50 assignments per call' };
		}

		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

		for (let i = 0; i < params.assignments.length; i++) {
			const a = params.assignments[i];
			if (!a.userId) {
				return { valid: false, error: `Assignment ${i + 1}: userId is required` };
			}
			if (!dateRegex.test(a.date)) {
				return { valid: false, error: `Assignment ${i + 1}: date must be YYYY-MM-DD format` };
			}
			if (!timeRegex.test(a.startTime)) {
				return { valid: false, error: `Assignment ${i + 1}: startTime must be HH:MM format` };
			}
			if (!timeRegex.test(a.endTime)) {
				return { valid: false, error: `Assignment ${i + 1}: endTime must be HH:MM format` };
			}
		}

		return { valid: true };
	},

	async execute(params: CreateScheduleParams, context: ToolExecutionContext): Promise<CreateScheduleResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - schedule would be created'
			};
		}

		try {
			// Verify all users exist
			const userIds = [...new Set(params.assignments.map(a => a.userId))];
			const existingUsers = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(inArray(users.id, userIds));

			const userMap = new Map(existingUsers.map(u => [u.id, u]));

			// Verify all locations exist if specified
			const locationIds = [...new Set(params.assignments.filter(a => a.locationId).map(a => a.locationId!))];
			if (locationIds.length > 0) {
				const existingLocations = await db
					.select({ id: locations.id })
					.from(locations)
					.where(inArray(locations.id, locationIds));

				const locationSet = new Set(existingLocations.map(l => l.id));
				for (const locId of locationIds) {
					if (!locationSet.has(locId)) {
						return { success: false, error: `Location ${locId} not found` };
					}
				}
			}

			const errors: string[] = [];
			const created: { userId: string; userName: string; date: string; times: string }[] = [];

			// Create shifts
			for (const assignment of params.assignments) {
				const user = userMap.get(assignment.userId);
				if (!user) {
					errors.push(`User ${assignment.userId} not found`);
					continue;
				}
				if (!user.isActive) {
					errors.push(`User ${user.name} is not active`);
					continue;
				}

				// Parse date and times as Pacific timezone
				const [startHour, startMin] = assignment.startTime.split(':').map(Number);
				const [endHour, endMin] = assignment.endTime.split(':').map(Number);

				const startTime = createPacificDateTime(assignment.date, startHour, startMin);
				let endTime = createPacificDateTime(assignment.date, endHour, endMin);

				// Handle overnight shifts (end time before start time)
				if (endTime <= startTime) {
					endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
				}

				try {
					await db.insert(shifts).values({
						userId: assignment.userId,
						locationId: assignment.locationId || null,
						startTime,
						endTime,
						notes: assignment.notes || null
					});

					created.push({
						userId: assignment.userId,
						userName: user.name,
						date: assignment.date,
						times: `${assignment.startTime}-${assignment.endTime}`
					});
				} catch (err) {
					errors.push(`Failed to create shift for ${user.name} on ${assignment.date}`);
				}
			}

			return {
				success: errors.length === 0,
				createdCount: created.length,
				failedCount: errors.length,
				assignments: created,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (error) {
			log.error('Create schedule tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateScheduleResult): string {
		if (!result.success && result.error) {
			return `Failed to create schedule: ${result.error}`;
		}

		let output = `Schedule created: ${result.createdCount} shifts`;
		if (result.failedCount && result.failedCount > 0) {
			output += `, ${result.failedCount} failed`;
		}

		if (result.assignments && result.assignments.length > 0) {
			output += '\n';
			result.assignments.slice(0, 5).forEach(a => {
				output += `\n- ${a.userName}: ${a.date} ${a.times}`;
			});
			if (result.assignments.length > 5) {
				output += `\n... and ${result.assignments.length - 5} more`;
			}
		}

		return output;
	}
};
