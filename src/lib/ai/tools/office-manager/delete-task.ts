// Delete Task Tool - Allows Office Manager AI to permanently delete tasks
import { db, tasks, taskCompletions, taskPhotos, auditLogs, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:delete-task');

interface DeleteTaskParams {
	taskId: string;
	reason?: string;
}

interface DeleteTaskResult {
	success: boolean;
	taskId?: string;
	taskTitle?: string;
	error?: string;
}

export const deleteTaskTool: AITool<DeleteTaskParams, DeleteTaskResult> = {
	name: 'delete_task',
	description: 'Permanently delete a task from the system. Use this when a task was created in error or is completely obsolete. For tasks that should be tracked but are no longer needed, use cancel_task instead.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			taskId: {
				type: 'string',
				description: 'The ID of the task to delete'
			},
			reason: {
				type: 'string',
				description: 'Optional reason for deleting the task (stored in audit log)'
			}
		},
		required: ['taskId']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 5
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: DeleteTaskParams): string {
		return `Are you sure you want to permanently delete task ${params.taskId}? This action cannot be undone.`;
	},

	validate(params: DeleteTaskParams) {
		if (!params.taskId || params.taskId.trim().length === 0) {
			return { valid: false, error: 'Task ID is required' };
		}
		if (!isValidUUID(params.taskId)) {
			return {
				valid: false,
				error: `Invalid taskId format: "${params.taskId}". Expected a UUID.`
			};
		}
		if (params.reason && params.reason.length > 500) {
			return { valid: false, error: 'Reason too long (max 500 chars)' };
		}
		return { valid: true };
	},

	async execute(params: DeleteTaskParams, context: ToolExecutionContext): Promise<DeleteTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - task would be deleted'
			};
		}

		try {
			// Get the task first to verify it exists and get info for audit log
			const [task] = await db
				.select({
					id: tasks.id,
					title: tasks.title,
					status: tasks.status,
					assignedTo: tasks.assignedTo,
					createdAt: tasks.createdAt
				})
				.from(tasks)
				.where(eq(tasks.id, params.taskId))
				.limit(1);

			if (!task) {
				return { success: false, error: 'Task not found' };
			}

			// Get admin user for audit log
			const [admin] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			// Delete related records first (cascade should handle this but being explicit)
			await db.delete(taskCompletions).where(eq(taskCompletions.taskId, params.taskId));
			await db.delete(taskPhotos).where(eq(taskPhotos.taskId, params.taskId));

			// Delete the task
			await db.delete(tasks).where(eq(tasks.id, params.taskId));

			// Create audit log entry
			if (admin) {
				await db.insert(auditLogs).values({
					userId: admin.id,
					action: 'delete',
					entityType: 'task',
					entityId: params.taskId,
					beforeData: {
						taskTitle: task.title,
						taskStatus: task.status,
						assignedTo: task.assignedTo,
						createdAt: task.createdAt
					},
					afterData: {
						deletedByOfficeManager: true,
						deletionReason: params.reason || 'No reason provided'
					}
				});
			}

			log.info({
				taskId: params.taskId,
				taskTitle: task.title,
				reason: params.reason
			}, 'Task deleted by Office Manager');

			return {
				success: true,
				taskId: params.taskId,
				taskTitle: task.title
			};
		} catch (error) {
			log.error({ error }, 'Delete task tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: DeleteTaskResult): string {
		if (result.success) {
			return `Task "${result.taskTitle}" has been permanently deleted.`;
		}
		return `Failed to delete task: ${result.error}`;
	}
};
