// Cancel Task Tool - Allows Office Manager AI to cancel tasks with messaging and accountability tracking
import { db, tasks, taskCompletions, users, conversations, conversationParticipants, messages, auditLogs } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:cancel-task');

interface CancelTaskParams {
	taskId: string;
	reason: string;
	countsAsMissed: boolean;
	messageToUser?: string;
}

interface CancelTaskResult {
	success: boolean;
	taskId?: string;
	taskTitle?: string;
	assigneeName?: string;
	messageSent?: boolean;
	error?: string;
}

// Find or create a direct conversation between AI system and user
async function getOrCreateAIConversation(userId: string, adminId: string): Promise<string> {
	// Look for existing direct conversation between admin and target user
	const existingConvs = await db
		.select({ conversationId: conversationParticipants.conversationId })
		.from(conversationParticipants)
		.where(eq(conversationParticipants.userId, userId));

	for (const conv of existingConvs) {
		// Check if admin is also in this conversation
		const adminInConv = await db
			.select()
			.from(conversationParticipants)
			.where(and(
				eq(conversationParticipants.conversationId, conv.conversationId),
				eq(conversationParticipants.userId, adminId)
			))
			.limit(1);

		if (adminInConv.length > 0) {
			// Check it's a direct conversation
			const convDetails = await db
				.select()
				.from(conversations)
				.where(and(
					eq(conversations.id, conv.conversationId),
					eq(conversations.type, 'direct')
				))
				.limit(1);

			if (convDetails.length > 0) {
				return conv.conversationId;
			}
		}
	}

	// Create new conversation
	const [newConv] = await db
		.insert(conversations)
		.values({
			type: 'direct',
			createdBy: adminId
		})
		.returning({ id: conversations.id });

	// Add participants
	await db.insert(conversationParticipants).values([
		{ conversationId: newConv.id, userId: adminId },
		{ conversationId: newConv.id, userId: userId }
	]);

	return newConv.id;
}

export const cancelTaskTool: AITool<CancelTaskParams, CancelTaskResult> = {
	name: 'cancel_task',
	description: 'Cancel a task that is no longer needed or relevant. This will mark the task as completed (cancelled), send a message to the assigned user explaining why, and optionally track whether the cancellation counts against their performance.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			taskId: {
				type: 'string',
				description: 'The ID of the task to cancel'
			},
			reason: {
				type: 'string',
				description: 'The reason for cancelling the task (will be stored in audit log)'
			},
			countsAsMissed: {
				type: 'boolean',
				description: 'Whether this cancellation should count as a missed task against the employee\'s performance metrics. Set to false if the task became irrelevant through no fault of the employee.'
			},
			messageToUser: {
				type: 'string',
				description: 'Optional custom message to send to the assigned user. If not provided, a default message will be generated.'
			}
		},
		required: ['taskId', 'reason', 'countsAsMissed']
	},

	requiresApproval: false,
	cooldown: {
		global: 5 // Don't cancel tasks too rapidly
	},
	rateLimit: {
		maxPerHour: 10
	},

	validate(params: CancelTaskParams) {
		if (!params.taskId || params.taskId.trim().length === 0) {
			return { valid: false, error: 'Task ID is required' };
		}
		if (!params.reason || params.reason.trim().length < 5) {
			return { valid: false, error: 'Cancellation reason is required (min 5 chars)' };
		}
		if (params.reason.length > 500) {
			return { valid: false, error: 'Cancellation reason too long (max 500 chars)' };
		}
		if (params.messageToUser && params.messageToUser.length > 1000) {
			return { valid: false, error: 'Message to user too long (max 1000 chars)' };
		}
		if (typeof params.countsAsMissed !== 'boolean') {
			return { valid: false, error: 'countsAsMissed must be a boolean' };
		}
		return { valid: true };
	},

	async execute(params: CancelTaskParams, context: ToolExecutionContext): Promise<CancelTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - task would be cancelled'
			};
		}

		try {
			// Get the task
			const [task] = await db
				.select({
					id: tasks.id,
					title: tasks.title,
					status: tasks.status,
					assignedTo: tasks.assignedTo
				})
				.from(tasks)
				.where(eq(tasks.id, params.taskId))
				.limit(1);

			if (!task) {
				return { success: false, error: 'Task not found' };
			}

			if (task.status === 'completed') {
				return { success: false, error: 'Task is already completed' };
			}

			// Get the assigned user's info if task is assigned
			let assigneeName: string | undefined;
			let assigneeId: string | undefined;
			if (task.assignedTo) {
				const [assignee] = await db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(eq(users.id, task.assignedTo))
					.limit(1);

				if (assignee) {
					assigneeName = assignee.name;
					assigneeId = assignee.id;
				}
			}

			// Get an admin user for the completion record and messaging
			const [admin] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			if (!admin) {
				return { success: false, error: 'No admin user found for system operations' };
			}

			// Create task completion record with cancellation metadata
			await db.insert(taskCompletions).values({
				taskId: params.taskId,
				completedBy: admin.id,
				completedAt: new Date(),
				notes: `Cancelled by Office Manager: ${params.reason}`,
				cancelledByOfficeManager: true,
				cancellationReason: params.reason,
				countsAsMissed: params.countsAsMissed
			});

			// Update task status to completed
			await db
				.update(tasks)
				.set({ status: 'completed', updatedAt: new Date() })
				.where(eq(tasks.id, params.taskId));

			// Create audit log entry
			await db.insert(auditLogs).values({
				userId: admin.id,
				action: 'cancel',
				entityType: 'task',
				entityId: params.taskId,
				afterData: {
					cancelledByOfficeManager: true,
					cancellationReason: params.reason,
					countsAsMissed: params.countsAsMissed,
					assignedTo: assigneeId,
					taskTitle: task.title
				}
			});

			// Send message to assigned user if there is one
			let messageSent = false;
			if (assigneeId) {
				try {
					const conversationId = await getOrCreateAIConversation(assigneeId, admin.id);

					// Generate message content
					const performanceNote = params.countsAsMissed
						? 'This cancellation has been noted in your task completion records.'
						: 'This cancellation does not affect your performance metrics.';

					const messageContent = params.messageToUser ||
						`Your task "${task.title}" has been cancelled.\n\nReason: ${params.reason}\n\n${performanceNote}`;

					await db.insert(messages).values({
						conversationId,
						senderId: admin.id,
						content: messageContent,
						isSystemMessage: true
					});

					// Update conversation timestamp
					await db
						.update(conversations)
						.set({ updatedAt: new Date() })
						.where(eq(conversations.id, conversationId));

					messageSent = true;
				} catch (msgError) {
					log.error('Cancel task - Failed to send message', { error: msgError });
					// Continue even if messaging fails - the cancellation is still valid
				}
			}

			return {
				success: true,
				taskId: params.taskId,
				taskTitle: task.title,
				assigneeName,
				messageSent
			};
		} catch (error) {
			log.error('Cancel task tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CancelTaskResult): string {
		if (result.success) {
			const assignee = result.assigneeName ? ` (assigned to ${result.assigneeName})` : ' (unassigned)';
			const msgStatus = result.messageSent ? ', notification sent' : '';
			return `Task "${result.taskTitle}" cancelled${assignee}${msgStatus}`;
		}
		return `Failed to cancel task: ${result.error}`;
	}
};
