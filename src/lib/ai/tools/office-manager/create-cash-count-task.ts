// Create Cash Count Task Tool - Assign cash count tasks to users
import { db, tasks, users, locations, cashCountConfigs, cashCountTaskLinks } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRequiredUserId, validateLocationId, isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:create-cash-count-task');

interface CreateCashCountTaskParams {
	userId: string;
	locationId: string;
	configId?: string; // Specific cash count config, or use default for location
	dueAt?: string; // ISO datetime, defaults to end of current shift
	priority?: 'low' | 'medium' | 'high' | 'urgent';
}

interface CreateCashCountTaskResult {
	success: boolean;
	taskId?: string;
	userName?: string;
	locationName?: string;
	configName?: string;
	dueAt?: string;
	error?: string;
}

export const createCashCountTaskTool: AITool<CreateCashCountTaskParams, CreateCashCountTaskResult> = {
	name: 'create_cash_count_task',
	description: 'Create a cash count task for a specific user at a location. Cash counts are important for accountability and should typically be done at shift start or end.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user who should complete the cash count'
			},
			locationId: {
				type: 'string',
				description: 'The location where the cash count should be performed'
			},
			configId: {
				type: 'string',
				description: 'Optional: specific cash count configuration to use'
			},
			dueAt: {
				type: 'string',
				description: 'When the cash count is due (ISO datetime). Defaults to 2 hours from now.'
			},
			priority: {
				type: 'string',
				enum: ['low', 'medium', 'high', 'urgent'],
				description: 'Task priority level'
			}
		},
		required: ['userId', 'locationId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		perUser: 30, // Don't assign same user more than once per 30 min
		global: 5
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: CreateCashCountTaskParams): string {
		let msg = `Create cash count task?\n\n`;
		msg += `Assigned to: User ${params.userId.slice(0, 8)}...\n`;
		msg += `Location: ${params.locationId.slice(0, 8)}...`;
		if (params.dueAt) {
			msg += `\nDue: ${new Date(params.dueAt).toLocaleString()}`;
		}
		return msg;
	},

	validate(params: CreateCashCountTaskParams) {
		// Validate userId format (required)
		const userIdValidation = validateRequiredUserId(params.userId, 'userId');
		if (!userIdValidation.valid) {
			return userIdValidation;
		}
		// Validate locationId format (required)
		if (!params.locationId) {
			return { valid: false, error: 'Location ID is required' };
		}
		if (!isValidUUID(params.locationId)) {
			return { valid: false, error: `Invalid locationId format: "${params.locationId}". Expected a UUID.` };
		}
		// Validate configId format if provided (optional)
		if (params.configId && !isValidUUID(params.configId)) {
			return { valid: false, error: `Invalid configId format: "${params.configId}". Expected a UUID.` };
		}
		if (params.dueAt) {
			const due = new Date(params.dueAt);
			if (isNaN(due.getTime())) {
				return { valid: false, error: 'Invalid due date format' };
			}
		}
		if (params.priority && !['low', 'medium', 'high', 'urgent'].includes(params.priority)) {
			return { valid: false, error: 'Invalid priority level' };
		}
		return { valid: true };
	},

	async execute(params: CreateCashCountTaskParams, context: ToolExecutionContext): Promise<CreateCashCountTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - cash count task would be created'
			};
		}

		try {
			// Verify user exists and is active
			const user = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, params.userId))
				.limit(1);

			if (user.length === 0) {
				return { success: false, error: 'User not found' };
			}
			if (!user[0].isActive) {
				return { success: false, error: 'User is not active' };
			}

			// Verify location exists
			const location = await db
				.select({ id: locations.id, name: locations.name })
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);

			if (location.length === 0) {
				return { success: false, error: 'Location not found' };
			}

			// Get cash count config if specified, or find default for location
			let configName = 'Cash Count';
			let configId = params.configId;
			if (params.configId) {
				const config = await db
					.select({ id: cashCountConfigs.id, name: cashCountConfigs.name })
					.from(cashCountConfigs)
					.where(
						and(
							eq(cashCountConfigs.id, params.configId),
							eq(cashCountConfigs.isActive, true)
						)
					)
					.limit(1);

				if (config.length === 0) {
					return { success: false, error: 'Cash count configuration not found or inactive' };
				}
				configName = config[0].name;
				configId = config[0].id;
			} else {
				// Try to find a default config for the location
				const config = await db
					.select({ id: cashCountConfigs.id, name: cashCountConfigs.name })
					.from(cashCountConfigs)
					.where(
						and(
							eq(cashCountConfigs.locationId, params.locationId),
							eq(cashCountConfigs.isActive, true)
						)
					)
					.limit(1);

				if (config.length > 0) {
					configName = config[0].name;
					configId = config[0].id;
				}
			}

			// Ensure we have a valid config for cash count tasks
			if (!configId) {
				return { success: false, error: 'No active cash count configuration found for this location. Please set up a cash count config first.' };
			}

			// Calculate due date
			const dueAt = params.dueAt
				? new Date(params.dueAt)
				: new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

			// Create the task
			const [task] = await db
				.insert(tasks)
				.values({
					title: `${configName} - ${location[0].name}`,
					description: `Complete the ${configName.toLowerCase()} at ${location[0].name}. Ensure all denominations are counted accurately.`,
					assignedTo: params.userId,
					priority: params.priority || 'high',
					dueAt,
					status: 'not_started',
					source: 'manual',
					photoRequired: false,
					notesRequired: true
				})
				.returning({ id: tasks.id });

			// Create link to cash count config so the UI can show the CashCountForm
			await db
				.insert(cashCountTaskLinks)
				.values({
					taskId: task.id,
					configId: configId!,
					locationId: params.locationId
				});

			return {
				success: true,
				taskId: task.id,
				userName: user[0].name,
				locationName: location[0].name,
				configName,
				dueAt: dueAt.toISOString()
			};
		} catch (error) {
			log.error({ error }, 'Create cash count task tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateCashCountTaskResult): string {
		if (result.success) {
			return `Cash count task "${result.configName}" created for ${result.userName} at ${result.locationName}`;
		}
		return `Failed to create cash count task: ${result.error}`;
	}
};
