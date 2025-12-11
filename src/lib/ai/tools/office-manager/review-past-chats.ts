// Review Past Chats Tool - Allows Office Manager to search her own conversation history
import type { AITool, ToolExecutionContext } from '../../types';
import { db, officeManagerChats, users } from '$lib/server/db';
import { desc, ilike, or, sql, and, gte, lte } from 'drizzle-orm';

interface ReviewPastChatsParams {
	searchQuery?: string; // Search in titles, summaries, and topics
	topic?: string; // Filter by specific topic
	actionType?: string; // Filter by action type (e.g., "send_message", "trade_shifts")
	limit?: number; // Max results (default 10)
	daysBack?: number; // How many days back to search (default 30)
}

interface ChatSummaryResult {
	id: string;
	title: string;
	summary: string | null;
	topics: string[];
	actionsPerformed: string[];
	messageCount: number;
	userName: string;
	createdAt: string;
	updatedAt: string;
}

interface ReviewPastChatsResult {
	success: boolean;
	chats: ChatSummaryResult[];
	totalFound: number;
	searchCriteria: {
		query?: string;
		topic?: string;
		actionType?: string;
		daysBack: number;
	};
}

export const reviewPastChatsTool: AITool<ReviewPastChatsParams, ReviewPastChatsResult> = {
	name: 'review_past_chats',
	description: `Search and review your past chat conversations to recall previous interactions, decisions, and context.
Use this when:
- A user references something discussed before ("remember when we...")
- You need context about past actions taken for a user
- You want to check if a similar situation was handled before
- You need to recall specific decisions or arrangements made`,
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			searchQuery: {
				type: 'string',
				description: 'Search text to find in chat titles, summaries, or content'
			},
			topic: {
				type: 'string',
				description: 'Filter by topic (e.g., "scheduling", "permissions", "tasks")'
			},
			actionType: {
				type: 'string',
				description: 'Filter by tool/action used (e.g., "send_message", "trade_shifts", "create_task")'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results to return (default 10, max 25)'
			},
			daysBack: {
				type: 'number',
				description: 'How many days back to search (default 30, max 90)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ReviewPastChatsParams) {
		if (params.limit !== undefined && (params.limit < 1 || params.limit > 25)) {
			return { valid: false, error: 'Limit must be between 1 and 25' };
		}
		if (params.daysBack !== undefined && (params.daysBack < 1 || params.daysBack > 90)) {
			return { valid: false, error: 'daysBack must be between 1 and 90' };
		}
		return { valid: true };
	},

	async execute(params: ReviewPastChatsParams, context: ToolExecutionContext): Promise<ReviewPastChatsResult> {
		const limit = Math.min(params.limit || 10, 25);
		const daysBack = Math.min(params.daysBack || 30, 90);
		const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

		// Build query conditions
		const conditions = [gte(officeManagerChats.createdAt, cutoffDate)];

		// Search query matches title, summary, or topics
		if (params.searchQuery) {
			const searchPattern = `%${params.searchQuery}%`;
			conditions.push(
				or(
					ilike(officeManagerChats.title, searchPattern),
					ilike(officeManagerChats.summary, searchPattern),
					sql`${officeManagerChats.topics}::text ILIKE ${searchPattern}`
				)!
			);
		}

		// Topic filter
		if (params.topic) {
			conditions.push(
				sql`${officeManagerChats.topics} @> ${JSON.stringify([params.topic])}::jsonb`
			);
		}

		// Action type filter
		if (params.actionType) {
			conditions.push(
				sql`${officeManagerChats.actionsPerformed} @> ${JSON.stringify([params.actionType])}::jsonb`
			);
		}

		// Execute query with user join
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
			.where(and(...conditions))
			.orderBy(desc(officeManagerChats.updatedAt))
			.limit(limit);

		const chats: ChatSummaryResult[] = results.map(r => ({
			id: r.id,
			title: r.title,
			summary: r.summary,
			topics: (r.topics as string[]) || [],
			actionsPerformed: (r.actionsPerformed as string[]) || [],
			messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
			userName: r.userName || 'Unknown',
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString()
		}));

		return {
			success: true,
			chats,
			totalFound: chats.length,
			searchCriteria: {
				query: params.searchQuery,
				topic: params.topic,
				actionType: params.actionType,
				daysBack
			}
		};
	},

	formatResult(result: ReviewPastChatsResult): string {
		if (!result.success) {
			return 'Failed to search past chats';
		}

		if (result.chats.length === 0) {
			return `No matching chats found in the past ${result.searchCriteria.daysBack} days`;
		}

		const lines = [`Found ${result.totalFound} relevant chat(s):`];

		for (const chat of result.chats) {
			const date = new Date(chat.createdAt).toLocaleDateString();
			lines.push(`\n• "${chat.title}" with ${chat.userName} (${date})`);
			if (chat.summary) {
				lines.push(`  Summary: ${chat.summary}`);
			}
			if (chat.topics.length > 0) {
				lines.push(`  Topics: ${chat.topics.join(', ')}`);
			}
			if (chat.actionsPerformed.length > 0) {
				lines.push(`  Actions: ${chat.actionsPerformed.join(', ')}`);
			}
		}

		return lines.join('\n');
	}
};
