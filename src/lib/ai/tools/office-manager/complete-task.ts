// Complete Task Tool - Allows Office Manager AI to mark tasks as completed with points and messaging
import { db, tasks, taskCompletions, users, conversations, conversationParticipants, messages, auditLogs } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID, validateUserId } from '../utils/validation';
import { awardTaskPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';

const log = createLogger('ai:tools:complete-task');

interface CompleteTaskParams {
	taskId: string;
	notes?: string;
	completedByUserId?: string;
}

interface CompleteTaskResult {
	success: boolean;
	taskId?: string;
	taskTitle?: string;
	completedForUser?: string;
	pointsAwarded?: number;
	error?: string;
}

// Find or create a direct conversation between AI system and user
async function getOrCreateAIConversation(userId: string, adminId: string): Promise<string> {
	const existingConvs = await db
		.select({ conversationId: conversationParticipants.conversationId })
		.from(conversationParticipants)
		.where(eq(conversationParticipants.userId, userId));

	for (const conv of existingConvs) {
		const adminInConv = await db
			.select()
			.from(conversationParticipants)
			.where(and(
				eq(conversationParticipants.conversationId, conv.conversationId),
				eq(conversationParticipants.userId, adminId)
			))
			.limit(1);

		if (adminInConv.length > 0) {
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

	const [newConv] = await db
		.insert(conversations)
		.values({
			type: 'direct',
			createdBy: adminId
		})
		.returning({ id: conversations.id });

	await db.insert(conversationParticipants).values([
		{ conversationId: newConv.id, userId: adminId },
		{ conversationId: newConv.id, userId: userId }
	]);

	return newConv.id;
}

export const completeTaskTool: AITool<CompleteTaskParams, CompleteTaskResult> = {
	name: 'complete_task',
	description: 'Mark a task as completed on behalf of a user. Awards points, checks achievements, and notifies the assigned user. Use when a manager confirms a task is done or asks to mark it complete.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			taskId: {
				type: 'string',
				description: 'The ID of the task to complete'
			},
			notes: {
				type: 'string',
				description: 'Optional notes about the completion (e.g., "Confirmed done by manager")'
			},
			completedByUserId: {
				type: 'string',
				description: 'Optional user ID to credit for completing the task. If not provided, the task assignee is credited.'
			}
		},
		required: ['taskId']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	rateLimit: {
		maxPerHour: 10
	},

	getConfirmationMessage(params: CompleteTaskParams): string {
		return `Mark task ${params.taskId} as completed${params.completedByUserId ? ` (credited to user ${params.completedByUserId})` : ''}?`;
	},

	validate(params: CompleteTaskParams) {
		if (!params.taskId || params.taskId.trim().length === 0) {
			return { valid: false, error: 'Task ID is required' };
		}
		if (!isValidUUID(params.taskId)) {
			return {
				valid: false,
				error: `Invalid taskId format: "${params.taskId}". Expected a UUID.`
			};
		}
		if (params.completedByUserId) {
			const userIdCheck = validateUserId(params.completedByUserId, 'completedByUserId');
			if (!userIdCheck.valid) {
				return { valid: false, error: userIdCheck.error };
			}
		}
		if (params.notes && params.notes.length > 1000) {
			return { valid: false, error: 'Notes too long (max 1000 chars)' };
		}
		return { valid: true };
	},

	async execute(params: CompleteTaskParams, context: ToolExecutionContext): Promise<CompleteTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - task would be completed'
			};
		}

		try {
			// Get the task
			const [task] = await db
				.select({
					id: tasks.id,
					title: tasks.title,
					status: tasks.status,
					assignedTo: tasks.assignedTo,
					dueAt: tasks.dueAt,
					photoRequired: tasks.photoRequired,
					notesRequired: tasks.notesRequired
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

			if (task.status === 'cancelled') {
				return { success: false, error: 'Task has been cancelled and cannot be completed' };
			}

			// Determine who to credit
			const creditUserId = params.completedByUserId || task.assignedTo;

			// Validate credited user exists
			let creditUserName: string | undefined;
			if (creditUserId) {
				const [creditUser] = await db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(eq(users.id, creditUserId))
					.limit(1);

				if (!creditUser) {
					return { success: false, error: 'Credited user not found' };
				}
				creditUserName = creditUser.name;
			}

			// Get an admin user for system operations
			const [admin] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			if (!admin) {
				return { success: false, error: 'No admin user found for system operations' };
			}

			const now = new Date();

			// Create task completion record
			await db.insert(taskCompletions).values({
				taskId: params.taskId,
				completedBy: creditUserId || admin.id,
				completedAt: now,
				notes: params.notes
					? `Completed via Office Manager: ${params.notes}`
					: 'Completed via Office Manager'
			});

			// Update task status
			await db
				.update(tasks)
				.set({ status: 'completed', updatedAt: now })
				.where(eq(tasks.id, params.taskId));

			// Award points
			let pointsAwarded = 0;
			if (creditUserId) {
				try {
					const pointResult = await awardTaskPoints({
						userId: creditUserId,
						taskId: params.taskId,
						dueAt: task.dueAt,
						completedAt: now,
						photoRequired: task.photoRequired,
						notesRequired: task.notesRequired,
						hasPhotos: false,
						hasNotes: !!params.notes
					});
					pointsAwarded = pointResult.points;
				} catch (err) {
					log.error({ error: err }, 'Complete task - Failed to award points');
				}

				// Check achievements
				try {
					await checkAndAwardAchievements(creditUserId);
				} catch (err) {
					log.error({ error: err }, 'Complete task - Failed to check achievements');
				}
			}

			// Create audit log entry
			await db.insert(auditLogs).values({
				userId: admin.id,
				action: 'complete',
				entityType: 'task',
				entityId: params.taskId,
				afterData: {
					completedByOfficeManager: true,
					creditedTo: creditUserId,
					creditedToName: creditUserName,
					taskTitle: task.title,
					pointsAwarded,
					notes: params.notes
				}
			});

			// Send notification to assigned user
			const notifyUserId = task.assignedTo;
			if (notifyUserId) {
				try {
					const conversationId = await getOrCreateAIConversation(notifyUserId, admin.id);

					const pointsNote = pointsAwarded > 0
						? ` You earned ${pointsAwarded} points!`
						: '';

					const messageContent = `Your task "${task.title}" has been marked as completed by the Office Manager.${pointsNote}`;

					await db.insert(messages).values({
						conversationId,
						senderId: admin.id,
						content: messageContent,
						isSystemMessage: true
					});

					await db
						.update(conversations)
						.set({ updatedAt: now })
						.where(eq(conversations.id, conversationId));
				} catch (msgError) {
					log.error({ error: msgError }, 'Complete task - Failed to send notification');
				}
			}

			return {
				success: true,
				taskId: params.taskId,
				taskTitle: task.title,
				completedForUser: creditUserName,
				pointsAwarded
			};
		} catch (error) {
			log.error({ error }, 'Complete task tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CompleteTaskResult): string {
		if (result.success) {
			const user = result.completedForUser ? ` for ${result.completedForUser}` : '';
			const points = result.pointsAwarded ? ` (${result.pointsAwarded} points awarded)` : '';
			return `Task "${result.taskTitle}" completed${user}${points}`;
		}
		return `Failed to complete task: ${result.error}`;
	}
};
