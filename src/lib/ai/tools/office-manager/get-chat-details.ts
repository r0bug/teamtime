// Get Chat Details Tool - Retrieve full conversation from a past chat
import type { AITool, ToolExecutionContext } from '../../types';
import { db, officeManagerChats, users } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import type { OfficeManagerMessage } from '$lib/server/db/schema';

interface GetChatDetailsParams {
	chatId: string; // The chat ID to retrieve
	messageLimit?: number; // Max messages to return (default all)
}

interface ChatDetailsResult {
	success: boolean;
	chat?: {
		id: string;
		title: string;
		summary: string | null;
		topics: string[];
		actionsPerformed: string[];
		userName: string;
		messages: {
			role: 'user' | 'assistant';
			content: string;
			timestamp: string;
			toolCalls?: {
				name: string;
				result?: unknown;
			}[];
		}[];
		createdAt: string;
		updatedAt: string;
	};
	error?: string;
}

export const getChatDetailsTool: AITool<GetChatDetailsParams, ChatDetailsResult> = {
	name: 'get_chat_details',
	description: `Get the full conversation details from a specific past chat.
Use this after review_past_chats to get the complete context of a conversation.
Returns all messages and tool calls from that chat session.`,
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			chatId: {
				type: 'string',
				description: 'The ID of the chat to retrieve (from review_past_chats results)'
			},
			messageLimit: {
				type: 'number',
				description: 'Maximum number of messages to return (default: all messages)'
			}
		},
		required: ['chatId']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: GetChatDetailsParams) {
		if (!params.chatId || typeof params.chatId !== 'string') {
			return { valid: false, error: 'chatId is required' };
		}
		if (params.messageLimit !== undefined && params.messageLimit < 1) {
			return { valid: false, error: 'messageLimit must be at least 1' };
		}
		return { valid: true };
	},

	async execute(params: GetChatDetailsParams, context: ToolExecutionContext): Promise<ChatDetailsResult> {
		const results = await db
			.select({
				id: officeManagerChats.id,
				title: officeManagerChats.title,
				summary: officeManagerChats.summary,
				topics: officeManagerChats.topics,
				actionsPerformed: officeManagerChats.actionsPerformed,
				messages: officeManagerChats.messages,
				createdAt: officeManagerChats.createdAt,
				updatedAt: officeManagerChats.updatedAt,
				userName: users.name
			})
			.from(officeManagerChats)
			.leftJoin(users, sql`${officeManagerChats.userId} = ${users.id}`)
			.where(eq(officeManagerChats.id, params.chatId))
			.limit(1);

		if (results.length === 0) {
			return {
				success: false,
				error: `Chat with ID ${params.chatId} not found`
			};
		}

		const r = results[0];
		let messages = (r.messages as OfficeManagerMessage[]) || [];

		// Apply message limit if specified
		if (params.messageLimit && messages.length > params.messageLimit) {
			messages = messages.slice(-params.messageLimit);
		}

		return {
			success: true,
			chat: {
				id: r.id,
				title: r.title,
				summary: r.summary,
				topics: (r.topics as string[]) || [],
				actionsPerformed: (r.actionsPerformed as string[]) || [],
				userName: r.userName || 'Unknown',
				messages: messages.map(m => ({
					role: m.role,
					content: m.content,
					timestamp: m.timestamp,
					toolCalls: m.toolCalls?.map(tc => ({
						name: tc.name,
						result: tc.result
					}))
				})),
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString()
			}
		};
	},

	formatResult(result: ChatDetailsResult): string {
		if (!result.success || !result.chat) {
			return result.error || 'Failed to retrieve chat details';
		}

		const chat = result.chat;
		const lines = [
			`Chat: "${chat.title}" with ${chat.userName}`,
			`Date: ${new Date(chat.createdAt).toLocaleDateString()}`
		];

		if (chat.summary) {
			lines.push(`Summary: ${chat.summary}`);
		}

		lines.push(`\n--- Conversation (${chat.messages.length} messages) ---\n`);

		for (const msg of chat.messages) {
			const time = new Date(msg.timestamp).toLocaleTimeString();
			const role = msg.role === 'user' ? 'User' : 'Assistant';
			lines.push(`[${time}] ${role}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`);

			if (msg.toolCalls && msg.toolCalls.length > 0) {
				for (const tc of msg.toolCalls) {
					lines.push(`  → ${tc.name}: ${JSON.stringify(tc.result).substring(0, 100)}`);
				}
			}
		}

		return lines.join('\n');
	}
};
