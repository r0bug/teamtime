// Create Task Tool - Allows AI to create tasks for users
import { db, tasks, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';

interface CreateTaskParams {
	title: string;
	description?: string;
	assignToUserId?: string;
	priority?: 'low' | 'medium' | 'high' | 'urgent';
	dueInHours?: number;
}

interface CreateTaskResult {
	success: boolean;
	taskId?: string;
	assigneeName?: string;
	error?: string;
}

export const createTaskTool: AITool<CreateTaskParams, CreateTaskResult> = {
	name: 'create_task',
	description: 'Create a new task, optionally assigned to a specific user. Use this for follow-ups, reminders to complete actions, or system-generated to-dos.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Task title (short and actionable)'
			},
			description: {
				type: 'string',
				description: 'Optional detailed description'
			},
			assignToUserId: {
				type: 'string',
				description: 'User ID to assign the task to (optional - can be unassigned)'
			},
			priority: {
				type: 'string',
				enum: ['low', 'medium', 'high', 'urgent'],
				description: 'Task priority (default: medium)'
			},
			dueInHours: {
				type: 'number',
				description: 'Hours from now until due (e.g., 24 for tomorrow)'
			}
		},
		required: ['title']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 60, // Don't create tasks for same user more than once per hour
		global: 10
	},
	rateLimit: {
		maxPerHour: 5
	},

	validate(params: CreateTaskParams) {
		if (!params.title || params.title.trim().length < 3) {
			return { valid: false, error: 'Task title is required (min 3 chars)' };
		}
		if (params.title.length > 200) {
			return { valid: false, error: 'Task title too long (max 200 chars)' };
		}
		if (params.description && params.description.length > 2000) {
			return { valid: false, error: 'Description too long (max 2000 chars)' };
		}
		if (params.dueInHours !== undefined && params.dueInHours < 0) {
			return { valid: false, error: 'dueInHours must be positive' };
		}
		return { valid: true };
	},

	async execute(params: CreateTaskParams, context: ToolExecutionContext): Promise<CreateTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - task would be created'
			};
		}

		try {
			let assigneeName: string | undefined;

			// Validate assignee if provided
			if (params.assignToUserId) {
				const user = await db
					.select({ id: users.id, name: users.name, isActive: users.isActive })
					.from(users)
					.where(eq(users.id, params.assignToUserId))
					.limit(1);

				if (user.length === 0) {
					return { success: false, error: 'User not found' };
				}
				if (!user[0].isActive) {
					return { success: false, error: 'User is not active' };
				}
				assigneeName = user[0].name;
			}

			// Calculate due date
			let dueAt: Date | null = null;
			if (params.dueInHours !== undefined) {
				dueAt = new Date(Date.now() + params.dueInHours * 60 * 60 * 1000);
			}

			// Get an admin user to use as creator
			const admins = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			const createdBy = admins.length > 0 ? admins[0].id : null;

			// Create the task
			const [newTask] = await db
				.insert(tasks)
				.values({
					title: params.title.trim(),
					description: params.description?.trim() || null,
					assignedTo: params.assignToUserId || null,
					priority: params.priority || 'medium',
					dueAt,
					status: 'not_started',
					source: 'event_triggered', // Could add 'ai_generated' source
					createdBy
				})
				.returning({ id: tasks.id });

			return {
				success: true,
				taskId: newTask.id,
				assigneeName
			};
		} catch (error) {
			console.error('[AI Tool] create_task error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateTaskResult): string {
		if (result.success) {
			const assignee = result.assigneeName ? ` for ${result.assigneeName}` : ' (unassigned)';
			return `Task created${assignee}`;
		}
		return `Failed to create task: ${result.error}`;
	}
};
