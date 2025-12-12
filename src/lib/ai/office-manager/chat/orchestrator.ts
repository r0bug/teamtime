// Office Manager Chat Orchestrator
// Single-model approach with confirmation workflow for dangerous actions
import { randomUUID } from 'crypto';
import { anthropicProvider } from '../../providers/anthropic';
import { officeManagerTools } from '../../tools/office-manager';
import {
	getChatSession,
	addUserMessage,
	addAssistantMessage,
	createPendingAction,
	logAIAction,
	trackActionPerformed,
	generateChatSummary,
	shouldSummarize,
	type PendingAction
} from './session';
import { assembleOfficeManagerContext } from '../context';
import type { AITool, ToolExecutionContext, LLMRequest } from '../../types';
import type { OfficeManagerMessage } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:office-manager:chat');

// System prompt for Office Manager chat
const OFFICE_MANAGER_SYSTEM_PROMPT = `You are the Office Manager AI assistant for TeamTime, a staff management system for a thrift store.

Your role is to help ALL users with their tasks - from basic staff to managers and admins. Different users have different permission levels.

## CRITICAL: Permission Checking (MUST DO FIRST)

At the START of EVERY new conversation, you MUST call the \`get_my_permissions\` tool FIRST before doing anything else. This tells you:
- The user's role and permission level
- Which tools you are ALLOWED to use for this user
- Which tools you must NOT attempt

NEVER attempt to use a tool that the user doesn't have permission for. If they ask for something they can't do, politely explain and suggest they contact a manager.

## Multi-Step Tasks

When a user request requires multiple tools:
1. First call \`get_my_permissions\` to understand what you can do
2. Plan all the steps needed
3. Execute tools ONE AT A TIME in sequence
4. After each tool completes, immediately call the next one
5. If using \`continue_work\`, call it to signal you have more work to do
6. Complete ALL steps before giving your final response

IMPORTANT: Do not stop after the first tool. If you need to use multiple tools, keep going until the task is complete.

## Available Capabilities (subject to user permissions)

- Scheduling and shift management
- Staff communication (messages and SMS)
- Task creation and assignment
- Cash count management
- Inventory processing
- Permission management (admin only)

## Memory & Past Conversations
You have access to your conversation history through these tools:
- **review_past_chats**: Search past conversations by topic, action type, or keywords
- **get_chat_details**: Get the full transcript of a specific past conversation

Use these when:
- A user references something discussed before ("remember when we talked about...")
- You need context about previous decisions or arrangements
- Checking if you've handled a similar situation before
- Understanding the history with a particular user

## Guidelines
- Be helpful, professional, and concise
- Explain what actions you're taking and why
- If a tool requires confirmation, explain what will happen when approved
- For scheduling changes, always consider who is currently working
- Be careful with SMS - only use for urgent matters
- When creating tasks, set appropriate priorities
- ALWAYS respect the user's permission level

## Permission Management Guidelines (Admin Only)
- Use permission tools to temporarily adjust user access when needed
- ALWAYS view current permissions before making changes (use view_user_permissions first)
- Provide clear, detailed justifications for all permission changes
- Prefer temporary grants over permanent changes
- Keep durations as short as possible while meeting the need
- Never attempt to modify admin users or grant admin-level access
- Sensitive permissions (admin, security modules) will require human approval
- Use rollback_permission_change to quickly revert changes if needed
- Changes to manager-level user types require human approval

Current context about the business will be provided. Use this to inform your responses.`;

export interface ProcessMessageResult {
	response: string;
	toolCalls: {
		name: string;
		params: Record<string, unknown>;
		result?: unknown;
		pendingActionId?: string;
		requiresConfirmation: boolean;
	}[];
	pendingActions: PendingAction[];
	tokensUsed: number;
}

/**
 * Process a user message in the Office Manager chat
 * @param chatId - The chat session ID
 * @param userMessage - The user's message
 * @param model - The LLM model to use
 * @param requestingUserId - The ID of the user making the request (for permission checking)
 */
export async function processUserMessage(
	chatId: string,
	userMessage: string,
	model = 'claude-sonnet-4-20250514',
	requestingUserId?: string
): Promise<ProcessMessageResult> {
	// Get the chat session
	const session = await getChatSession(chatId);
	if (!session) {
		throw new Error(`Chat session ${chatId} not found`);
	}

	// Use the session's userId if requestingUserId not provided
	const userId = requestingUserId || session.userId;

	// Add user message to chat
	await addUserMessage(chatId, userMessage);

	// Assemble context
	const context = await assembleOfficeManagerContext();

	// Build conversation history for the LLM
	const conversationHistory = buildConversationHistory(session.messages);

	// Build the user prompt with context
	const userPrompt = `${conversationHistory}

## Current Context
${context}

## User Message
${userMessage}`;

	// Get tools formatted for the LLM
	const tools = officeManagerTools;

	// Make the LLM request
	const request: LLMRequest = {
		model,
		systemPrompt: OFFICE_MANAGER_SYSTEM_PROMPT,
		userPrompt,
		tools,
		maxTokens: 2048,
		temperature: 0.3
	};

	const runId = randomUUID();
	const llmResponse = await anthropicProvider.complete(request);

	// Process tool calls
	const processedToolCalls: ProcessMessageResult['toolCalls'] = [];
	const pendingActions: PendingAction[] = [];

	if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
		for (const toolCall of llmResponse.toolCalls) {
			const tool = tools.find(t => t.name === toolCall.name);
			if (!tool) {
				log.warn('Unknown tool requested in chat', { chatId, toolName: toolCall.name });
				continue;
			}

			// Check if tool requires confirmation
			if (tool.requiresConfirmation) {
				// Create pending action for user approval
				const confirmationMessage = tool.getConfirmationMessage
					? tool.getConfirmationMessage(toolCall.params)
					: `Confirm action: ${toolCall.name}?`;

				const pendingAction = await createPendingAction(
					chatId,
					toolCall.name,
					toolCall.params,
					confirmationMessage
				);

				pendingActions.push(pendingAction);

				processedToolCalls.push({
					name: toolCall.name,
					params: toolCall.params,
					pendingActionId: pendingAction.id,
					requiresConfirmation: true
				});

				// Log the action (not yet executed)
				await logAIAction({
					runId,
					provider: 'anthropic',
					model,
					toolName: toolCall.name,
					toolParams: toolCall.params,
					executed: false
				});
			} else {
				// Execute the tool immediately (read-only or low-risk)
				const executionContext: ToolExecutionContext = {
					runId,
					agent: 'office_manager',
					dryRun: false,
					config: {
						provider: 'anthropic',
						model
					},
					chatId,
					userId
				};

				const validation = tool.validate(toolCall.params);
				if (!validation.valid) {
					processedToolCalls.push({
						name: toolCall.name,
						params: toolCall.params,
						result: { error: validation.error },
						requiresConfirmation: false
					});
					continue;
				}

				try {
					const result = await tool.execute(toolCall.params, executionContext);

					processedToolCalls.push({
						name: toolCall.name,
						params: toolCall.params,
						result,
						requiresConfirmation: false
					});

					// Log the action
					await logAIAction({
						runId,
						provider: 'anthropic',
						model,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: true,
						executionResult: result as Record<string, unknown>
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					processedToolCalls.push({
						name: toolCall.name,
						params: toolCall.params,
						result: { error: errorMessage },
						requiresConfirmation: false
					});

					await logAIAction({
						runId,
						provider: 'anthropic',
						model,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: false,
						error: errorMessage
					});
				}
			}
		}
	}

	// Build the assistant response content
	let responseContent = llmResponse.content;

	// If there are pending actions, append confirmation prompts
	if (pendingActions.length > 0) {
		responseContent += '\n\n**Actions pending confirmation:**\n';
		for (const action of pendingActions) {
			responseContent += `\n- ${action.confirmationMessage}`;
		}
	}

	// Add assistant message to chat
	const messageToolCalls = processedToolCalls.length > 0
		? processedToolCalls.map(tc => ({
			name: tc.name,
			params: tc.params,
			result: tc.result,
			pendingActionId: tc.pendingActionId
		}))
		: undefined;

	await addAssistantMessage(chatId, responseContent, messageToolCalls);

	// Track actions performed for searchability
	for (const tc of processedToolCalls) {
		if (tc.requiresConfirmation || tc.result) {
			await trackActionPerformed(chatId, tc.name);
		}
	}

	// Generate summary if chat has grown long enough
	const updatedSession = await getChatSession(chatId);
	if (updatedSession && shouldSummarize(updatedSession.messages.length, null)) {
		// Run summary generation in background (don't await)
		generateChatSummary(chatId, anthropicProvider, model).catch(err => {
			log.warn({ chatId, error: err }, 'Failed to generate chat summary');
		});
	}

	return {
		response: responseContent,
		toolCalls: processedToolCalls,
		pendingActions,
		tokensUsed: llmResponse.usage.inputTokens + llmResponse.usage.outputTokens
	};
}

/**
 * Execute a confirmed pending action
 * @param actionId - The pending action ID
 * @param pendingAction - The pending action to execute
 * @param requestingUserId - The ID of the user confirming the action
 */
export async function executeConfirmedAction(
	actionId: string,
	pendingAction: PendingAction,
	requestingUserId?: string
): Promise<{ success: boolean; result: unknown }> {
	const tool = officeManagerTools.find(t => t.name === pendingAction.toolName);
	if (!tool) {
		return { success: false, result: { error: `Unknown tool: ${pendingAction.toolName}` } };
	}

	const runId = randomUUID();
	const executionContext: ToolExecutionContext = {
		runId,
		agent: 'office_manager',
		dryRun: false,
		config: {
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514'
		},
		chatId: pendingAction.chatId,
		userId: requestingUserId
	};

	try {
		const validation = tool.validate(pendingAction.toolArgs);
		if (!validation.valid) {
			return { success: false, result: { error: validation.error } };
		}

		const result = await tool.execute(pendingAction.toolArgs, executionContext);

		await logAIAction({
			runId,
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			toolName: pendingAction.toolName,
			toolParams: pendingAction.toolArgs,
			executed: true,
			executionResult: result as Record<string, unknown>
		});

		return { success: true, result };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		await logAIAction({
			runId,
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			toolName: pendingAction.toolName,
			toolParams: pendingAction.toolArgs,
			executed: false,
			error: errorMessage
		});

		return { success: false, result: { error: errorMessage } };
	}
}

/**
 * Stream event types for real-time updates
 */
export interface StreamEvent {
	type: 'text' | 'tool_start' | 'tool_result' | 'pending_action' | 'done' | 'error';
	content?: string;
	toolName?: string;
	toolParams?: Record<string, unknown>;
	result?: unknown;
	formattedResult?: string; // Human-readable formatted result
	pendingActionId?: string;
	confirmationMessage?: string;
	tokensUsed?: number;
	error?: string;
}

/**
 * Process a user message with streaming response
 * @param chatId - The chat session ID
 * @param userMessage - The user's message
 * @param model - The LLM model to use
 * @param requestingUserId - The ID of the user making the request (for permission checking)
 */
export async function* processUserMessageStream(
	chatId: string,
	userMessage: string,
	model = 'claude-sonnet-4-20250514',
	requestingUserId?: string
): AsyncGenerator<StreamEvent> {
	// Get the chat session
	const session = await getChatSession(chatId);
	if (!session) {
		yield { type: 'error', error: `Chat session ${chatId} not found` };
		return;
	}

	// Use the session's userId if requestingUserId not provided
	const userId = requestingUserId || session.userId;

	// Add user message to chat
	await addUserMessage(chatId, userMessage);

	// Assemble context
	const context = await assembleOfficeManagerContext();

	// Build conversation history for the LLM
	const conversationHistory = buildConversationHistory(session.messages);

	// Build the user prompt with context
	const userPrompt = `${conversationHistory}

## Current Context
${context}

## User Message
${userMessage}`;

	// Get tools formatted for the LLM
	const tools = officeManagerTools;

	// Make the streaming LLM request
	const request: LLMRequest = {
		model,
		systemPrompt: OFFICE_MANAGER_SYSTEM_PROMPT,
		userPrompt,
		tools,
		maxTokens: 2048,
		temperature: 0.3
	};

	const runId = randomUUID();
	let fullContent = '';
	const processedToolCalls: ProcessMessageResult['toolCalls'] = [];
	const pendingActions: PendingAction[] = [];
	let tokensUsed = 0;

	try {
		if (!anthropicProvider.stream) {
			throw new Error('Streaming not supported by this provider');
		}
		for await (const chunk of anthropicProvider.stream(request)) {
			if (chunk.type === 'text' && chunk.content) {
				fullContent += chunk.content;
				yield { type: 'text', content: chunk.content };
			} else if (chunk.type === 'tool_use' && chunk.toolCall) {
				const { name, params } = chunk.toolCall;
				log.info({ toolName: name, params }, 'Tool called with params');
				yield { type: 'tool_start', toolName: name, toolParams: params };

				const tool = tools.find(t => t.name === name);
				if (!tool) {
					yield { type: 'tool_result', toolName: name, result: { error: `Unknown tool: ${name}` } };
					continue;
				}

				// Check if tool requires confirmation
				if (tool.requiresConfirmation) {
					const confirmationMessage = tool.getConfirmationMessage
						? tool.getConfirmationMessage(params)
						: `Confirm action: ${name}?`;

					const pendingAction = await createPendingAction(
						chatId,
						name,
						params,
						confirmationMessage
					);

					pendingActions.push(pendingAction);

					processedToolCalls.push({
						name,
						params,
						pendingActionId: pendingAction.id,
						requiresConfirmation: true
					});

					yield {
						type: 'pending_action',
						toolName: name,
						pendingActionId: pendingAction.id,
						confirmationMessage
					};

					await logAIAction({
						runId,
						provider: 'anthropic',
						model,
						toolName: name,
						toolParams: params,
						executed: false
					});
				} else {
					// Execute the tool immediately
					const executionContext: ToolExecutionContext = {
						runId,
						agent: 'office_manager',
						dryRun: false,
						config: { provider: 'anthropic', model },
						chatId,
						userId
					};

					const validation = tool.validate(params);
					if (!validation.valid) {
						const result = { error: validation.error };
						processedToolCalls.push({ name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						continue;
					}

					try {
						const result = await tool.execute(params, executionContext);
						processedToolCalls.push({ name, params, result, requiresConfirmation: false });

						// Format result for human-readable display
						const formattedResult = tool.formatResult ? tool.formatResult(result) : undefined;
						yield { type: 'tool_result', toolName: name, result, formattedResult };

						await logAIAction({
							runId,
							provider: 'anthropic',
							model,
							toolName: name,
							toolParams: params,
							executed: true,
							executionResult: result as Record<string, unknown>
						});
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						const result = { error: errorMessage };
						processedToolCalls.push({ name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };

						await logAIAction({
							runId,
							provider: 'anthropic',
							model,
							toolName: name,
							toolParams: params,
							executed: false,
							error: errorMessage
						});
					}
				}
			} else if (chunk.type === 'done' && chunk.usage) {
				tokensUsed = chunk.usage.inputTokens + chunk.usage.outputTokens;
			}
		}

		// Build the full response content
		let responseContent = fullContent;
		if (pendingActions.length > 0) {
			responseContent += '\n\n**Actions pending confirmation:**\n';
			for (const action of pendingActions) {
				responseContent += `\n- ${action.confirmationMessage}`;
			}
		}

		// Save the assistant message
		const messageToolCalls = processedToolCalls.length > 0
			? processedToolCalls.map(tc => ({
				name: tc.name,
				params: tc.params,
				result: tc.result,
				pendingActionId: tc.pendingActionId
			}))
			: undefined;

		await addAssistantMessage(chatId, responseContent, messageToolCalls);

		yield { type: 'done', tokensUsed };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		yield { type: 'error', error: errorMessage };
	}
}

/**
 * Build conversation history string for the LLM
 */
function buildConversationHistory(messages: OfficeManagerMessage[]): string {
	if (messages.length === 0) {
		return '';
	}

	let history = '## Conversation History\n';

	// Only include last 10 messages to save tokens
	const recentMessages = messages.slice(-10);

	for (const msg of recentMessages) {
		const role = msg.role === 'user' ? 'User' : 'Assistant';
		history += `\n**${role}:** ${msg.content}\n`;

		if (msg.toolCalls && msg.toolCalls.length > 0) {
			history += `\n*Tool calls:*\n`;
			for (const tc of msg.toolCalls) {
				history += `- ${tc.name}: ${JSON.stringify(tc.result || 'pending')}\n`;
			}
		}
	}

	return history;
}
