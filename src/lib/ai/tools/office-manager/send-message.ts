// Send Message Tool - Allows AI to send direct messages to users
import { db, conversations, conversationParticipants, messages, users } from '$lib/server/db';
import { eq, and, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:send-message');

interface SendMessageParams {
	toUserId: string;
	content: string;
	isAdminMessage?: boolean;
}

interface SendMessageResult {
	success: boolean;
	conversationId?: string;
	messageId?: string;
	recipientName?: string;
	error?: string;
}

// Find or create a direct conversation between AI system and user
async function getOrCreateAIConversation(userId: string): Promise<string> {
	// Look for existing direct conversation where AI system is a participant
	// For now, we'll use the admin user as the AI's "sender" identity
	// In the future, we might create a dedicated AI system user

	// Get admin users
	const admins = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, 'admin'))
		.limit(1);

	if (admins.length === 0) {
		throw new Error('No admin user found to send AI messages');
	}

	const adminId = admins[0].id;

	// Look for existing conversation between admin and target user
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

export const sendMessageTool: AITool<SendMessageParams, SendMessageResult> = {
	name: 'send_message',
	description: 'Send a direct message to a staff member. Use this for reminders, check-ins, workflow tips, or any communication with individual users.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			toUserId: {
				type: 'string',
				description: 'The user ID to send the message to'
			},
			content: {
				type: 'string',
				description: 'The message content (keep it concise and helpful)'
			},
			isAdminMessage: {
				type: 'boolean',
				description: 'If true, sends to all admin users instead of the specified user'
			}
		},
		required: ['content']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 30, // Don't message same user more than once per 30 min
		global: 5 // Don't send more than once every 5 min globally
	},
	rateLimit: {
		maxPerHour: 10
	},

	validate(params: SendMessageParams) {
		if (!params.content || params.content.trim().length < 2) {
			return { valid: false, error: 'Message content is required' };
		}
		if (params.content.length > 1000) {
			return { valid: false, error: 'Message too long (max 1000 chars)' };
		}
		if (!params.toUserId && !params.isAdminMessage) {
			return { valid: false, error: 'Either toUserId or isAdminMessage is required' };
		}
		return { valid: true };
	},

	async execute(params: SendMessageParams, context: ToolExecutionContext): Promise<SendMessageResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - message would be sent'
			};
		}

		try {
			let targetUserIds: string[] = [];
			let recipientName = '';

			if (params.isAdminMessage) {
				// Send to all admins
				const admins = await db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(eq(users.role, 'admin'));
				targetUserIds = admins.map(a => a.id);
				recipientName = `${admins.length} admin(s)`;
			} else {
				// Send to specific user
				const user = await db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(eq(users.id, params.toUserId))
					.limit(1);

				if (user.length === 0) {
					return { success: false, error: 'User not found' };
				}
				targetUserIds = [params.toUserId];
				recipientName = user[0].name;
			}

			// Get admin to use as sender
			const admins = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			if (admins.length === 0) {
				return { success: false, error: 'No admin user to send from' };
			}

			let messageId: string | undefined;
			let conversationId: string | undefined;

			// Send to each target user
			for (const targetUserId of targetUserIds) {
				conversationId = await getOrCreateAIConversation(targetUserId);

				const [msg] = await db
					.insert(messages)
					.values({
						conversationId,
						senderId: admins[0].id,
						content: params.content,
						isSystemMessage: true // Mark as AI/system message
					})
					.returning({ id: messages.id });

				messageId = msg.id;

				// Update conversation timestamp
				await db
					.update(conversations)
					.set({ updatedAt: new Date() })
					.where(eq(conversations.id, conversationId));
			}

			return {
				success: true,
				conversationId,
				messageId,
				recipientName
			};
		} catch (error) {
			log.error('Send message tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: SendMessageResult): string {
		if (result.success) {
			return `Message sent to ${result.recipientName || 'user'}`;
		}
		return `Failed to send message: ${result.error}`;
	}
};
