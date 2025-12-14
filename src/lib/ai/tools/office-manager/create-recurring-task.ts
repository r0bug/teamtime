// Create Recurring Task Tool - Set up task templates with recurrence rules
import { db, taskTemplates, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId, validateLocationId } from '../utils/validation';

const log = createLogger('ai:tools:create-recurring-task');

interface RecurrenceRule {
	frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
	interval?: number;
	daysOfWeek?: number[]; // 0=Sunday, 6=Saturday
	timeOfDay?: string; // HH:MM format
}

interface CreateRecurringTaskParams {
	name: string;
	description?: string;
	recurrence: RecurrenceRule;
	assigneeId?: string;
	locationId?: string;
	photoRequired?: boolean;
	notesRequired?: boolean;
}

interface CreateRecurringTaskResult {
	success: boolean;
	templateId?: string;
	templateName?: string;
	recurrenceDescription?: string;
	error?: string;
}

function formatRecurrence(rule: RecurrenceRule): string {
	const daysNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	let desc = '';
	switch (rule.frequency) {
		case 'daily':
			desc = rule.interval && rule.interval > 1 ? `Every ${rule.interval} days` : 'Daily';
			break;
		case 'weekly':
			if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
				const days = rule.daysOfWeek.map(d => daysNames[d]).join(', ');
				desc = `Weekly on ${days}`;
			} else {
				desc = 'Weekly';
			}
			break;
		case 'monthly':
			desc = rule.interval && rule.interval > 1 ? `Every ${rule.interval} months` : 'Monthly';
			break;
		case 'custom':
			desc = 'Custom schedule';
			break;
	}

	if (rule.timeOfDay) {
		desc += ` at ${rule.timeOfDay}`;
	}

	return desc;
}

export const createRecurringTaskTool: AITool<CreateRecurringTaskParams, CreateRecurringTaskResult> = {
	name: 'create_recurring_task',
	description: 'Create a recurring task template. The template will generate tasks automatically based on the recurrence rule. Good for daily cleaning, weekly inventory, monthly reports, etc.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'Name of the recurring task'
			},
			description: {
				type: 'string',
				description: 'Detailed description of what the task involves'
			},
			recurrence: {
				type: 'object',
				properties: {
					frequency: {
						type: 'string',
						enum: ['daily', 'weekly', 'monthly', 'custom']
					},
					interval: {
						type: 'number',
						description: 'Repeat every N periods (e.g., 2 for every other day)'
					},
					daysOfWeek: {
						type: 'array',
						items: { type: 'number' },
						description: 'For weekly: which days (0=Sunday, 6=Saturday)'
					},
					timeOfDay: {
						type: 'string',
						description: 'Time when task should be created/due (HH:MM)'
					}
				},
				required: ['frequency']
			},
			assigneeId: {
				type: 'string',
				description: 'Default assignee user ID (optional)'
			},
			locationId: {
				type: 'string',
				description: 'Location where task should be performed'
			},
			photoRequired: {
				type: 'boolean',
				description: 'Whether photo documentation is required'
			},
			notesRequired: {
				type: 'boolean',
				description: 'Whether notes are required on completion'
			}
		},
		required: ['name', 'recurrence']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		perUser: 60, // Don't create templates too quickly
		global: 10
	},
	rateLimit: {
		maxPerHour: 5
	},

	getConfirmationMessage(params: CreateRecurringTaskParams): string {
		const recurrenceDesc = formatRecurrence(params.recurrence);
		let msg = `Create recurring task template?\n\n`;
		msg += `Name: ${params.name}\n`;
		msg += `Schedule: ${recurrenceDesc}`;
		if (params.description) {
			msg += `\nDescription: ${params.description}`;
		}
		return msg;
	},

	validate(params: CreateRecurringTaskParams) {
		if (!params.name || params.name.trim().length < 3) {
			return { valid: false, error: 'Task name is required (min 3 chars)' };
		}
		if (!params.recurrence) {
			return { valid: false, error: 'Recurrence rule is required' };
		}
		if (!['daily', 'weekly', 'monthly', 'custom'].includes(params.recurrence.frequency)) {
			return { valid: false, error: 'Invalid recurrence frequency' };
		}
		if (params.recurrence.timeOfDay) {
			const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
			if (!timeRegex.test(params.recurrence.timeOfDay)) {
				return { valid: false, error: 'Invalid time format. Use HH:MM' };
			}
		}
		// Validate assignee ID format if provided
		const assigneeValidation = validateUserId(params.assigneeId, 'assigneeId');
		if (!assigneeValidation.valid) {
			return assigneeValidation;
		}
		// Validate location ID format if provided
		const locationValidation = validateLocationId(params.locationId);
		if (!locationValidation.valid) {
			return locationValidation;
		}
		return { valid: true };
	},

	async execute(params: CreateRecurringTaskParams, context: ToolExecutionContext): Promise<CreateRecurringTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - task template would be created'
			};
		}

		try {
			// Verify assignee exists if specified
			if (params.assigneeId) {
				const user = await db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.id, params.assigneeId))
					.limit(1);

				if (user.length === 0) {
					return { success: false, error: 'Assignee user not found' };
				}
			}

			// Verify location exists if specified
			if (params.locationId) {
				const location = await db
					.select({ id: locations.id })
					.from(locations)
					.where(eq(locations.id, params.locationId))
					.limit(1);

				if (location.length === 0) {
					return { success: false, error: 'Location not found' };
				}
			}

			// Create the task template
			const [template] = await db
				.insert(taskTemplates)
				.values({
					name: params.name,
					description: params.description || null,
					recurrenceRule: params.recurrence,
					locationId: params.locationId || null,
					photoRequired: params.photoRequired || false,
					notesRequired: params.notesRequired || false,
					isActive: true
				})
				.returning({ id: taskTemplates.id, name: taskTemplates.name });

			return {
				success: true,
				templateId: template.id,
				templateName: template.name,
				recurrenceDescription: formatRecurrence(params.recurrence)
			};
		} catch (error) {
			log.error('Create recurring task tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateRecurringTaskResult): string {
		if (result.success) {
			return `Created recurring task "${result.templateName}" (${result.recurrenceDescription})`;
		}
		return `Failed to create recurring task: ${result.error}`;
	}
};
