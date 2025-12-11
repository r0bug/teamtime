// Office Manager Chat Session Management
import { db, officeManagerChats, officeManagerPendingActions, aiActions } from '$lib/server/db';
import { eq, desc, and, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { OfficeManagerMessage } from '$lib/server/db/schema';

export interface PendingAction {
	id: string;
	chatId: string;
	toolName: string;
	toolArgs: Record<string, unknown>;
	confirmationMessage: string;
	status: 'pending' | 'approved' | 'rejected' | 'expired';
	executionResult?: Record<string, unknown>;
	executedAt?: Date;
	createdAt: Date;
	expiresAt: Date;
}

export interface ChatSession {
	id: string;
	userId: string;
	title: string;
	messages: OfficeManagerMessage[];
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Create a new Office Manager chat session
 */
export async function createChatSession(userId: string, title?: string): Promise<ChatSession> {
	const [chat] = await db
		.insert(officeManagerChats)
		.values({
			userId,
			title: title || 'New Chat',
			messages: []
		})
		.returning();

	return mapToSession(chat);
}

/**
 * Get a chat session by ID
 */
export async function getChatSession(chatId: string): Promise<ChatSession | null> {
	const [chat] = await db
		.select()
		.from(officeManagerChats)
		.where(eq(officeManagerChats.id, chatId));

	if (!chat) return null;
	return mapToSession(chat);
}

/**
 * Get a chat session by ID, verifying user ownership
 */
export async function getChatSessionForUser(chatId: string, userId: string): Promise<ChatSession | null> {
	const [chat] = await db
		.select()
		.from(officeManagerChats)
		.where(
			and(
				eq(officeManagerChats.id, chatId),
				eq(officeManagerChats.userId, userId)
			)
		);

	if (!chat) return null;
	return mapToSession(chat);
}

/**
 * List chat sessions for a user
 */
export async function listChatSessions(userId: string, limit = 20): Promise<ChatSession[]> {
	const chats = await db
		.select()
		.from(officeManagerChats)
		.where(eq(officeManagerChats.userId, userId))
		.orderBy(desc(officeManagerChats.updatedAt))
		.limit(limit);

	return chats.map(mapToSession);
}

/**
 * Update chat session title
 */
export async function updateChatTitle(chatId: string, title: string): Promise<void> {
	await db
		.update(officeManagerChats)
		.set({ title, updatedAt: new Date() })
		.where(eq(officeManagerChats.id, chatId));
}

/**
 * Add a user message to the chat
 */
export async function addUserMessage(chatId: string, content: string): Promise<OfficeManagerMessage> {
	const session = await getChatSession(chatId);
	if (!session) {
		throw new Error(`Chat session ${chatId} not found`);
	}

	const newMessage: OfficeManagerMessage = {
		id: randomUUID(),
		role: 'user',
		content,
		timestamp: new Date().toISOString()
	};

	const updatedMessages = [...session.messages, newMessage];

	await db
		.update(officeManagerChats)
		.set({
			messages: updatedMessages,
			updatedAt: new Date()
		})
		.where(eq(officeManagerChats.id, chatId));

	// Auto-generate title if first message
	if (session.messages.length === 0) {
		const autoTitle = generateTitle(content);
		await updateChatTitle(chatId, autoTitle);
	}

	return newMessage;
}

/**
 * Add an assistant message to the chat
 */
export async function addAssistantMessage(
	chatId: string,
	content: string,
	toolCalls?: OfficeManagerMessage['toolCalls']
): Promise<OfficeManagerMessage> {
	const session = await getChatSession(chatId);
	if (!session) {
		throw new Error(`Chat session ${chatId} not found`);
	}

	const newMessage: OfficeManagerMessage = {
		id: randomUUID(),
		role: 'assistant',
		content,
		timestamp: new Date().toISOString(),
		toolCalls
	};

	const updatedMessages = [...session.messages, newMessage];

	await db
		.update(officeManagerChats)
		.set({
			messages: updatedMessages,
			updatedAt: new Date()
		})
		.where(eq(officeManagerChats.id, chatId));

	return newMessage;
}

/**
 * Create a pending action for user confirmation
 */
export async function createPendingAction(
	chatId: string,
	toolName: string,
	toolArgs: Record<string, unknown>,
	confirmationMessage: string,
	expiresInMinutes = 30
): Promise<PendingAction> {
	const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

	const [action] = await db
		.insert(officeManagerPendingActions)
		.values({
			chatId,
			toolName,
			toolArgs,
			confirmationMessage,
			status: 'pending',
			expiresAt
		})
		.returning();

	return mapToPendingAction(action);
}

/**
 * Get a pending action by ID
 */
export async function getPendingAction(actionId: string): Promise<PendingAction | null> {
	const [action] = await db
		.select()
		.from(officeManagerPendingActions)
		.where(eq(officeManagerPendingActions.id, actionId));

	if (!action) return null;
	return mapToPendingAction(action);
}

/**
 * Get all pending actions for a chat
 */
export async function getPendingActionsForChat(chatId: string): Promise<PendingAction[]> {
	const actions = await db
		.select()
		.from(officeManagerPendingActions)
		.where(
			and(
				eq(officeManagerPendingActions.chatId, chatId),
				eq(officeManagerPendingActions.status, 'pending')
			)
		)
		.orderBy(desc(officeManagerPendingActions.createdAt));

	return actions.map(mapToPendingAction);
}

/**
 * Approve a pending action
 */
export async function approvePendingAction(
	actionId: string,
	result: Record<string, unknown>
): Promise<PendingAction> {
	const [action] = await db
		.update(officeManagerPendingActions)
		.set({
			status: 'approved',
			executionResult: result,
			executedAt: new Date()
		})
		.where(eq(officeManagerPendingActions.id, actionId))
		.returning();

	if (!action) {
		throw new Error(`Pending action ${actionId} not found`);
	}

	return mapToPendingAction(action);
}

/**
 * Reject a pending action
 */
export async function rejectPendingAction(actionId: string): Promise<PendingAction> {
	const [action] = await db
		.update(officeManagerPendingActions)
		.set({
			status: 'rejected'
		})
		.where(eq(officeManagerPendingActions.id, actionId))
		.returning();

	if (!action) {
		throw new Error(`Pending action ${actionId} not found`);
	}

	return mapToPendingAction(action);
}

/**
 * Expire old pending actions (run periodically)
 */
export async function expireOldActions(): Promise<number> {
	const now = new Date();
	const result = await db
		.update(officeManagerPendingActions)
		.set({ status: 'expired' })
		.where(
			and(
				eq(officeManagerPendingActions.status, 'pending'),
				lt(officeManagerPendingActions.expiresAt, now)
			)
		)
		.returning();

	return result.length;
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(chatId: string): Promise<void> {
	// Pending actions will be cascade deleted
	await db
		.delete(officeManagerChats)
		.where(eq(officeManagerChats.id, chatId));
}

/**
 * Log an AI action for auditing
 */
export async function logAIAction(params: {
	runId: string;
	provider?: 'anthropic' | 'openai' | 'segmind';
	model?: string;
	toolName: string;
	toolParams: Record<string, unknown>;
	executed: boolean;
	executionResult?: Record<string, unknown>;
	targetUserId?: string;
	error?: string;
	tokensUsed?: number;
	costCents?: number;
}): Promise<void> {
	await db.insert(aiActions).values({
		agent: 'office_manager',
		runId: params.runId,
		runStartedAt: new Date(),
		provider: params.provider,
		model: params.model,
		toolName: params.toolName,
		toolParams: params.toolParams,
		executed: params.executed,
		executionResult: params.executionResult,
		targetUserId: params.targetUserId,
		error: params.error,
		tokensUsed: params.tokensUsed,
		costCents: params.costCents
	});
}

// Helper to map DB record to session interface
function mapToSession(chat: typeof officeManagerChats.$inferSelect): ChatSession {
	return {
		id: chat.id,
		userId: chat.userId,
		title: chat.title,
		messages: (chat.messages as OfficeManagerMessage[]) || [],
		createdAt: chat.createdAt,
		updatedAt: chat.updatedAt
	};
}

// Helper to map DB record to pending action interface
function mapToPendingAction(action: typeof officeManagerPendingActions.$inferSelect): PendingAction {
	return {
		id: action.id,
		chatId: action.chatId,
		toolName: action.toolName,
		toolArgs: action.toolArgs as Record<string, unknown>,
		confirmationMessage: action.confirmationMessage,
		status: action.status as PendingAction['status'],
		executionResult: action.executionResult as Record<string, unknown> | undefined,
		executedAt: action.executedAt || undefined,
		createdAt: action.createdAt,
		expiresAt: action.expiresAt
	};
}

// Generate a title from the first message
function generateTitle(message: string): string {
	const cleaned = message
		.replace(/\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleaned.length <= 40) {
		return cleaned;
	}

	const truncated = cleaned.substring(0, 40);
	const lastSpace = truncated.lastIndexOf(' ');
	if (lastSpace > 25) {
		return truncated.substring(0, lastSpace) + '...';
	}
	return truncated + '...';
}

/**
 * Update the actions performed in a chat (for searchability)
 */
export async function trackActionPerformed(chatId: string, toolName: string): Promise<void> {
	const [chat] = await db
		.select({ actionsPerformed: officeManagerChats.actionsPerformed })
		.from(officeManagerChats)
		.where(eq(officeManagerChats.id, chatId));

	if (!chat) return;

	const actions = (chat.actionsPerformed as string[]) || [];
	if (!actions.includes(toolName)) {
		await db
			.update(officeManagerChats)
			.set({
				actionsPerformed: [...actions, toolName],
				updatedAt: new Date()
			})
			.where(eq(officeManagerChats.id, chatId));
	}
}

/**
 * Generate and store a summary for a chat session
 * Called when chat reaches certain length or when explicitly requested
 */
export async function generateChatSummary(
	chatId: string,
	provider: { complete: (req: { model: string; systemPrompt: string; userPrompt: string; maxTokens: number; temperature: number }) => Promise<{ content: string }> },
	model = 'claude-sonnet-4-20250514'
): Promise<{ summary: string; topics: string[] }> {
	const session = await getChatSession(chatId);
	if (!session) {
		throw new Error(`Chat session ${chatId} not found`);
	}

	// Build conversation text for summarization
	const conversationText = session.messages
		.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
		.join('\n\n');

	// Get unique actions performed
	const actionsUsed = new Set<string>();
	for (const msg of session.messages) {
		if (msg.toolCalls) {
			for (const tc of msg.toolCalls) {
				actionsUsed.add(tc.name);
			}
		}
	}

	const systemPrompt = `You are a helpful assistant that creates concise summaries of conversations.
Your task is to summarize a conversation between a user and the Office Manager AI.

Respond with JSON in this exact format:
{
  "summary": "A 2-3 sentence summary of what was discussed and decided",
  "topics": ["topic1", "topic2"] // 2-5 key topics covered
}

Topics should be single words or short phrases like: scheduling, permissions, tasks, attendance, communication, shifts, staff, onboarding, etc.`;

	const userPrompt = `Please summarize this conversation:

${conversationText}

Actions/tools used: ${Array.from(actionsUsed).join(', ') || 'none'}`;

	try {
		const response = await provider.complete({
			model,
			systemPrompt,
			userPrompt,
			maxTokens: 256,
			temperature: 0.3
		});

		// Parse JSON response
		const jsonMatch = response.content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Failed to parse summary response');
		}

		const parsed = JSON.parse(jsonMatch[0]) as { summary: string; topics: string[] };

		// Update the chat record
		await db
			.update(officeManagerChats)
			.set({
				summary: parsed.summary,
				topics: parsed.topics,
				actionsPerformed: Array.from(actionsUsed),
				updatedAt: new Date()
			})
			.where(eq(officeManagerChats.id, chatId));

		return parsed;
	} catch (error) {
		// Fallback: generate simple summary without AI
		const summary = `Chat about: ${session.title}. ${session.messages.length} messages exchanged.`;
		const topics = Array.from(actionsUsed).length > 0
			? Array.from(actionsUsed).map(a => a.replace(/_/g, ' '))
			: ['general'];

		await db
			.update(officeManagerChats)
			.set({
				summary,
				topics,
				actionsPerformed: Array.from(actionsUsed),
				updatedAt: new Date()
			})
			.where(eq(officeManagerChats.id, chatId));

		return { summary, topics };
	}
}

/**
 * Check if a chat should be summarized (e.g., reached message threshold)
 */
export function shouldSummarize(messageCount: number, currentSummary: string | null): boolean {
	// Summarize every 20 messages if no summary, or every 40 messages to update
	if (!currentSummary && messageCount >= 10) return true;
	if (currentSummary && messageCount >= 20) return true;
	return false;
}
