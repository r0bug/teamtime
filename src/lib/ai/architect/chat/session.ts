// Architect Chat Session Management
import { db, architectureChats, aiActions } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { assembleArchitectContext, formatArchitectContext } from '../context';
import { buildArchitectSystemPrompt, buildArchitectUserPrompt } from '../../prompts';
import { getArchitectToolsForLLM, executeArchitectTool } from '../tools';
import type { AIConfig } from '../../types';
import {
	quickConsultation,
	standardConsultation,
	deliberateConsultation,
	type ConsultationResult,
	type ConsultationTier
} from '../multi-model';
import { detectConsultationTier, type TriggerResult } from '../triggers';
import {
	getArchitectConfig,
	getQuickModelConfig,
	getStandardModelConfig,
	getDeliberationConfig
} from '../config';

export interface ConsultationMetadata {
	tier: ConsultationTier;
	reason: string;
	triggers: string[];
	models: {
		primary: { provider: string; model: string };
		review?: { provider: string; model: string };
		synthesizer?: { provider: string; model: string };
	};
	costCents: number;
	tokensUsed: number;
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	toolCalls?: {
		name: string;
		params: unknown;
		result?: unknown;
	}[];
	consultation?: ConsultationMetadata;
}

export interface ChatSession {
	id: string;
	title: string | null;
	messages: ChatMessage[];
	contextModules: string[] | null;
	tokensUsed: number;
	costCents: number;
	decisionsCreated: string[];
	promptsGenerated: number;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Create a new chat session
 */
export async function createChatSession(userId?: string): Promise<ChatSession> {
	const [chat] = await db
		.insert(architectureChats)
		.values({
			messages: [],
			createdByUserId: userId
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
		.from(architectureChats)
		.where(eq(architectureChats.id, chatId));

	if (!chat) return null;
	return mapToSession(chat);
}

/**
 * List all chat sessions
 */
export async function listChatSessions(limit = 20): Promise<ChatSession[]> {
	const chats = await db
		.select()
		.from(architectureChats)
		.orderBy(architectureChats.updatedAt)
		.limit(limit);

	return chats.map(mapToSession);
}

/**
 * Update chat session title
 */
export async function updateChatTitle(chatId: string, title: string): Promise<void> {
	await db
		.update(architectureChats)
		.set({ title, updatedAt: new Date() })
		.where(eq(architectureChats.id, chatId));
}

/**
 * Add a message to a chat session and get AI response
 * Uses multi-model consultation based on detected tier
 */
export async function sendMessage(
	chatId: string,
	userMessage: string,
	config: AIConfig,
	contextModules?: string[]
): Promise<{
	response: string;
	toolCalls: { name: string; params: unknown; result?: unknown }[];
	tokensUsed: number;
	consultation: ConsultationMetadata;
}> {
	// Get current session
	const session = await getChatSession(chatId);
	if (!session) {
		throw new Error(`Chat session ${chatId} not found`);
	}

	// Assemble context
	const context = await assembleArchitectContext(contextModules);
	const contextFormatted = formatArchitectContext(context);

	// Build prompts
	const systemPrompt = buildArchitectSystemPrompt(config.customInstructions);
	const userPrompt = buildArchitectUserPrompt(userMessage, contextFormatted);

	// Get tools for LLM
	const tools = getArchitectToolsForLLM();

	// Generate a run ID for grouping actions
	const runId = randomUUID();
	const runStartedAt = new Date();

	try {
		// Get architect config for multi-model consultation
		const architectConfigData = await getArchitectConfig();

		// Detect consultation tier based on message content
		const tierDetection = detectConsultationTier(userMessage, architectConfigData);
		console.log(`[Architect] Detected tier: ${tierDetection.tier}, reason: ${tierDetection.reason}`);

		// Perform consultation based on detected tier
		let consultationResult: ConsultationResult;

		switch (tierDetection.tier) {
			case 'quick':
				consultationResult = await quickConsultation(
					systemPrompt,
					userPrompt,
					tools,
					getQuickModelConfig(architectConfigData),
					tierDetection.reason
				);
				break;

			case 'standard':
				consultationResult = await standardConsultation(
					systemPrompt,
					userPrompt,
					tools,
					getStandardModelConfig(architectConfigData),
					tierDetection.reason
				);
				break;

			case 'deliberate':
				consultationResult = await deliberateConsultation(
					systemPrompt,
					userPrompt,
					tools,
					getDeliberationConfig(architectConfigData),
					tierDetection.reason
				);
				break;
		}

		// Build consultation metadata
		const consultationMetadata: ConsultationMetadata = {
			tier: consultationResult.tier,
			reason: consultationResult.reason,
			triggers: tierDetection.triggers,
			models: {
				primary: {
					provider: consultationResult.primary.provider,
					model: consultationResult.primary.model
				},
				...(consultationResult.review && {
					review: {
						provider: consultationResult.review.provider,
						model: consultationResult.review.model
					}
				}),
				...(consultationResult.synthesis && {
					synthesizer: {
						provider: consultationResult.synthesis.provider,
						model: consultationResult.synthesis.model
					}
				})
			},
			costCents: consultationResult.totalCostCents,
			tokensUsed: consultationResult.totalTokens
		};

		// Process any tool calls
		const processedToolCalls: { name: string; params: unknown; result?: unknown }[] = [];
		let promptsGenerated = session.promptsGenerated;
		let decisionsCreated = [...session.decisionsCreated];

		if (consultationResult.finalToolCalls?.length) {
			for (const toolCall of consultationResult.finalToolCalls) {
				const result = await executeArchitectTool(
					toolCall.name,
					toolCall.params,
					{ runId, chatId }
				);

				// Record the action
				await db.insert(aiActions).values({
					runId,
					runStartedAt,
					agent: 'architect',
					toolName: toolCall.name,
					parameters: toolCall.params as Record<string, unknown>,
					result: result.result as Record<string, unknown>,
					executed: result.success
				});

				processedToolCalls.push({
					name: toolCall.name,
					params: toolCall.params,
					result: result.result
				});

				// Track metrics
				if (toolCall.name === 'create_claude_code_prompt' && result.success) {
					promptsGenerated++;
				}
				if (toolCall.name === 'create_architecture_decision' && result.success) {
					const decisionResult = result.result as { decisionId?: string };
					if (decisionResult.decisionId) {
						decisionsCreated.push(decisionResult.decisionId);
					}
				}
			}
		}

		// Build new messages array
		const newUserMessage: ChatMessage = {
			role: 'user',
			content: userMessage,
			timestamp: new Date().toISOString()
		};

		const newAssistantMessage: ChatMessage = {
			role: 'assistant',
			content: consultationResult.finalContent,
			timestamp: new Date().toISOString(),
			toolCalls: processedToolCalls.length > 0 ? processedToolCalls : undefined,
			consultation: consultationMetadata
		};

		const updatedMessages = [...session.messages, newUserMessage, newAssistantMessage];

		// Update the session
		await db
			.update(architectureChats)
			.set({
				messages: updatedMessages,
				contextModules: contextModules || null,
				tokensUsed: session.tokensUsed + consultationResult.totalTokens,
				costCents: session.costCents + consultationResult.totalCostCents,
				promptsGenerated,
				decisionsCreated,
				updatedAt: new Date()
			})
			.where(eq(architectureChats.id, chatId));

		// Auto-generate title if first message and no title
		if (session.messages.length === 0 && !session.title) {
			const autoTitle = generateTitle(userMessage);
			await updateChatTitle(chatId, autoTitle);
		}

		return {
			response: consultationResult.finalContent,
			toolCalls: processedToolCalls,
			tokensUsed: consultationResult.totalTokens,
			consultation: consultationMetadata
		};
	} catch (error) {
		throw error;
	}
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(chatId: string): Promise<void> {
	await db
		.delete(architectureChats)
		.where(eq(architectureChats.id, chatId));
}

// Helper to map DB record to session interface
function mapToSession(chat: typeof architectureChats.$inferSelect): ChatSession {
	return {
		id: chat.id,
		title: chat.title,
		messages: chat.messages as ChatMessage[],
		contextModules: chat.contextModules as string[] | null,
		tokensUsed: chat.tokensUsed || 0,
		costCents: chat.costCents || 0,
		decisionsCreated: (chat.decisionsCreated as string[]) || [],
		promptsGenerated: chat.promptsGenerated || 0,
		createdAt: chat.createdAt,
		updatedAt: chat.updatedAt
	};
}

// Generate a title from the first message
function generateTitle(message: string): string {
	// Take first 50 chars of the message, clean it up
	const cleaned = message
		.replace(/\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleaned.length <= 50) {
		return cleaned;
	}

	// Find a natural break point
	const truncated = cleaned.substring(0, 50);
	const lastSpace = truncated.lastIndexOf(' ');
	if (lastSpace > 30) {
		return truncated.substring(0, lastSpace) + '...';
	}
	return truncated + '...';
}
