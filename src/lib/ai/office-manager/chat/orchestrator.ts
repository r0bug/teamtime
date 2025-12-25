/**
 * @module AI/OfficeManager/ChatOrchestrator
 * @description Interactive chat orchestrator for Office Manager AI.
 *
 * This module handles real-time user interactions with the Office Manager AI,
 * including streaming responses, tool execution with confirmations, and
 * multi-turn conversations.
 *
 * Key Features:
 * - Streaming LLM responses via Anthropic API
 * - Tool confirmation workflow for destructive actions
 * - Context assembly with attendance, tasks, and staff data
 * - Multi-turn conversation support with iteration limits
 * - Automatic chat summarization for long conversations
 *
 * @example
 * // Process user message with streaming
 * for await (const event of processUserMessageStream(chatId, message, userId)) {
 *   if (event.type === 'text') console.log(event.content);
 * }
 */
import { randomUUID } from 'crypto';
import { anthropicProvider, streamWithToolResults, type ToolResult } from '../../providers/anthropic';
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
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { aiConfigService } from '../../services/config-service';

const log = createLogger('ai:office-manager:chat');

// System prompt for Office Manager chat
const OFFICE_MANAGER_SYSTEM_PROMPT = `You are the Office Manager AI assistant for TeamTime, a staff management system for a thrift store.

Your role is to help ALL users with their tasks - from basic staff to managers and admins. Different users have different permission levels.

## Permissions

The user's permissions are provided in the context below under "Your Permissions for This User".
- ONLY use tools listed under "ALLOWED Tools"
- NEVER attempt to use tools listed under "DENIED Tools"
- If a user asks for something you cannot do, politely explain and suggest they contact a manager

## CRITICAL: You Must Use Tools - NEVER just describe actions

When a user asks you to DO something (create, apply, schedule, send, etc.), you MUST call tools. NEVER respond with only text like "I'll do this" or "Let me create that" - that is WRONG.

### Example - User says "apply this schedule for Emily and Patty next week"

**WRONG RESPONSE** (DO NOT DO THIS):
"I'll create the schedule for next week. Let me apply this weekly pattern."

**CORRECT RESPONSE** (DO THIS):
Call get_available_staff tool immediately to get user IDs, then call create_schedule.

### Rules:
1. If user asks to CREATE/APPLY/SCHEDULE something → call a tool NOW
2. If you need user IDs from names → call get_available_staff FIRST
3. NEVER say "I'll do X" without actually calling a tool in the same response
4. Text-only responses are ONLY acceptable for questions/clarifications, NOT action requests

## Multi-Step Schedule Creation

When creating schedules with staff names (Emily, Patty, Michael, etc.):
1. IMMEDIATELY call get_available_staff to get their user IDs
2. Match names to IDs from the result
3. Call create_schedule with the matched user IDs
4. Do NOT just describe what you'll do - actually do it

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
- ALWAYS respect the user's permission level shown in the context

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

// Staff names to watch for (common names that might be in scheduling requests)
// This remains hardcoded since staff names are dynamic per installation
const STAFF_NAME_PATTERNS = /\b(emily|patty|michael|dale|terrance|terrence)\b/i;

/**
 * Check if a message contains keywords that should trigger context injection
 * Uses the database-driven config service for dynamic keyword management
 */
async function needsStaffContext(message: string): Promise<boolean> {
	// Check for staff names (always triggers staff context)
	const hasStaffName = STAFF_NAME_PATTERNS.test(message);
	if (hasStaffName) return true;

	// Check database-configured context trigger keywords
	const triggeredProviders = await aiConfigService.findTriggeredContextProviders('office_manager', message);
	// If 'users' provider is triggered, we need staff context
	return triggeredProviders.includes('users');
}

/**
 * Check which tool (if any) should be forced based on message keywords
 * Uses the database-driven config service for dynamic keyword management
 */
async function findForcedTool(message: string): Promise<string | null> {
	// Check database-configured force keywords
	const forcedTool = await aiConfigService.findForcedTool('office_manager', message);

	// For create_schedule, also require staff names for safety
	if (forcedTool === 'create_schedule') {
		const hasStaffName = STAFF_NAME_PATTERNS.test(message);
		return hasStaffName ? forcedTool : null;
	}

	return forcedTool;
}

/**
 * Pre-fetch staff list with IDs and names for context enrichment
 */
async function getStaffListForContext(): Promise<string> {
	try {
		const staffList = await db
			.select({
				id: users.id,
				name: users.name,
				role: users.role
			})
			.from(users)
			.where(eq(users.isActive, true));

		if (staffList.length === 0) {
			return '';
		}

		const lines = ['## Staff Directory (for scheduling - use these exact IDs)'];
		for (const staff of staffList) {
			lines.push(`- **${staff.name}** (${staff.role}): ID = \`${staff.id}\``);
		}
		lines.push('');
		lines.push('When creating schedules, use the user IDs above, not names.');

		return lines.join('\n');
	} catch (error) {
		log.error({ error }, 'Failed to fetch staff list for context');
		return '';
	}
}

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

	// Assemble context with user permissions
	const context = await assembleOfficeManagerContext(3000, userId);

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
 * Continue the conversation after a confirmed action is executed
 * This allows the AI to continue with remaining tasks after user approves an action
 * @param chatId - The chat session ID
 * @param executedAction - Details about the action that was just executed
 * @param requestingUserId - The ID of the user who confirmed the action
 * @param model - The LLM model to use
 */
export async function* continueAfterConfirmation(
	chatId: string,
	executedAction: { toolName: string; toolArgs: Record<string, unknown>; result: unknown },
	requestingUserId: string,
	model = 'claude-sonnet-4-20250514'
): AsyncGenerator<StreamEvent> {
	log.info({ chatId, toolName: executedAction.toolName, requestingUserId }, 'CONTINUATION: Starting post-confirmation continuation');

	try {
		// Get the chat session
		const session = await getChatSession(chatId);
		if (!session) {
			log.error({ chatId }, 'CONTINUATION ERROR: Chat session not found');
			yield { type: 'error', error: `Chat session ${chatId} not found` };
			return;
		}

		const userId = requestingUserId || session.userId;
		const runId = randomUUID();

		// Assemble context with user permissions
		const context = await assembleOfficeManagerContext(3000, userId);

		// Build conversation history
		const conversationHistory = buildConversationHistory(session.messages);

		// Build continuation prompt - the AI should know the action was just completed
		const tool = officeManagerTools.find(t => t.name === executedAction.toolName);
		const formattedResult = tool?.formatResult
			? tool.formatResult(executedAction.result)
			: JSON.stringify(executedAction.result);

		const continuationPrompt = `${conversationHistory}

## Current Context
${context}

## Action Just Completed
The user approved and the following action was just executed:
- Tool: ${executedAction.toolName}
- Result: ${formattedResult}

Continue with any remaining tasks from the original request. If there are more items to process (like deleting more duplicate schedules), proceed with the next one. If all tasks are complete, summarize what was accomplished.`;

		// Get tools
		const tools = officeManagerTools;

		// Build LLM request
		const request: LLMRequest = {
			model,
			systemPrompt: OFFICE_MANAGER_SYSTEM_PROMPT,
			userPrompt: continuationPrompt,
			tools: tools.map(t => ({
				name: t.name,
				description: t.description,
				parameters: t.parameters
			})),
			maxTokens: 4096,
			temperature: 0.7
		};

		// Stream the LLM response
		let fullContent = '';
		let tokensUsed = 0;
		const allToolCalls: ExecutedToolCall[] = [];
		const pendingActions: PendingAction[] = [];
		let needsContinuation = false;
		let continuationTurn = 0;
		const MAX_CONTINUATION_TURNS = 5;

		// Initial LLM call
		let currentTurnToolCalls: ExecutedToolCall[] = [];
		let currentTurnContent = '';

		for await (const chunk of anthropicProvider.stream(request)) {
			if (chunk.type === 'text' && chunk.content) {
				fullContent += chunk.content;
				currentTurnContent += chunk.content;
				yield { type: 'text', content: chunk.content };
			} else if (chunk.type === 'tool_use' && chunk.toolCall) {
				const { id, name, params } = chunk.toolCall;
				const toolId = id || `tool_${randomUUID().slice(0, 8)}`;

				yield { type: 'tool_start', toolName: name, toolParams: params };

				const calledTool = tools.find(t => t.name === name);
				if (!calledTool) {
					const result = { error: `Unknown tool: ${name}` };
					currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
					yield { type: 'tool_result', toolName: name, result };
					needsContinuation = true;
					continue;
				}

				// Handle confirmation-required tools
				if (calledTool.requiresConfirmation) {
					const confirmationMessage = calledTool.getConfirmationMessage
						? calledTool.getConfirmationMessage(params)
						: `Confirm action: ${name}?`;

					const pendingAction = await createPendingAction(chatId, name, params, confirmationMessage);
					pendingActions.push(pendingAction);
					currentTurnToolCalls.push({
						id: toolId,
						name,
						params,
						result: { pending: true, confirmationMessage },
						requiresConfirmation: true,
						pendingActionId: pendingAction.id
					});

					yield {
						type: 'pending_action',
						toolName: name,
						pendingActionId: pendingAction.id,
						confirmationMessage
					};
				} else {
					// Execute non-confirmation tools immediately
					const executionContext: ToolExecutionContext = {
						runId,
						agent: 'office_manager',
						dryRun: false,
						config: { provider: 'anthropic', model },
						chatId,
						userId
					};

					const validation = calledTool.validate(params);
					if (!validation.valid) {
						const result = { error: validation.error };
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;
						continue;
					}

					try {
						const result = await calledTool.execute(params, executionContext);
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });

						const formatted = calledTool.formatResult ? calledTool.formatResult(result) : undefined;
						yield { type: 'tool_result', toolName: name, result, formattedResult: formatted };

						await logAIAction({
							runId,
							provider: 'anthropic',
							model,
							toolName: name,
							toolParams: params,
							executed: true,
							executionResult: result as Record<string, unknown>
						});

						needsContinuation = true;
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						const result = { error: errorMessage };
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;
					}
				}
			} else if (chunk.type === 'done' && chunk.usage) {
				tokensUsed += chunk.usage.inputTokens + chunk.usage.outputTokens;
			}
		}

		allToolCalls.push(...currentTurnToolCalls);

		// Multi-turn continuation (same logic as processUserMessageStream)
		const messages: Array<{role: string; content: unknown}> = [];
		while (needsContinuation && continuationTurn < MAX_CONTINUATION_TURNS) {
			continuationTurn++;
			needsContinuation = false;

			const assistantContent: Array<{type: string; [key: string]: unknown}> = [];
			if (currentTurnContent) {
				assistantContent.push({ type: 'text', text: currentTurnContent });
			}
			for (const tc of currentTurnToolCalls) {
				assistantContent.push({
					type: 'tool_use',
					id: tc.id,
					name: tc.name,
					input: tc.params
				});
			}

			messages.push({ role: 'assistant', content: assistantContent });

			const toolResults: ToolResult[] = currentTurnToolCalls.map(tc => ({
				toolUseId: tc.id,
				toolName: tc.name,
				result: tc.result,
				isError: !!(tc.result && typeof tc.result === 'object' && 'error' in tc.result)
			}));

			currentTurnToolCalls = [];
			currentTurnContent = '';

			const toolResultContentForHistory: Array<{type: string; [key: string]: unknown}> = toolResults.map(tr => ({
				type: 'tool_result' as const,
				tool_use_id: tr.toolUseId,
				content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
				is_error: tr.isError === true ? true : undefined
			}));

			for await (const chunk of streamWithToolResults(request, messages, toolResults)) {
				if (chunk.type === 'text' && chunk.content) {
					fullContent += chunk.content;
					currentTurnContent += chunk.content;
					yield { type: 'text', content: chunk.content };
				} else if (chunk.type === 'tool_use' && chunk.toolCall) {
					const { id, name, params } = chunk.toolCall;
					const toolId = id || `tool_${randomUUID().slice(0, 8)}`;
					yield { type: 'tool_start', toolName: name, toolParams: params };

					const calledTool = tools.find(t => t.name === name);
					if (!calledTool) {
						const result = { error: `Unknown tool: ${name}` };
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;
						continue;
					}

					if (calledTool.requiresConfirmation) {
						const confirmationMessage = calledTool.getConfirmationMessage
							? calledTool.getConfirmationMessage(params)
							: `Confirm action: ${name}?`;

						const pendingAction = await createPendingAction(chatId, name, params, confirmationMessage);
						pendingActions.push(pendingAction);
						currentTurnToolCalls.push({
							id: toolId,
							name,
							params,
							result: { pending: true, confirmationMessage },
							requiresConfirmation: true,
							pendingActionId: pendingAction.id
						});

						yield {
							type: 'pending_action',
							toolName: name,
							pendingActionId: pendingAction.id,
							confirmationMessage
						};
					} else {
						const executionContext: ToolExecutionContext = {
							runId,
							agent: 'office_manager',
							dryRun: false,
							config: { provider: 'anthropic', model },
							chatId,
							userId
						};

						const validation = calledTool.validate(params);
						if (!validation.valid) {
							const result = { error: validation.error };
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
							yield { type: 'tool_result', toolName: name, result };
							needsContinuation = true;
							continue;
						}

						try {
							const result = await calledTool.execute(params, executionContext);
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });

							const formatted = calledTool.formatResult ? calledTool.formatResult(result) : undefined;
							yield { type: 'tool_result', toolName: name, result, formattedResult: formatted };

							await logAIAction({
								runId,
								provider: 'anthropic',
								model,
								toolName: name,
								toolParams: params,
								executed: true,
								executionResult: result as Record<string, unknown>
							});

							needsContinuation = true;
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							const result = { error: errorMessage };
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
							yield { type: 'tool_result', toolName: name, result };
							needsContinuation = true;
						}
					}
				} else if (chunk.type === 'done' && chunk.usage) {
					tokensUsed += chunk.usage.inputTokens + chunk.usage.outputTokens;
				}
			}

			allToolCalls.push(...currentTurnToolCalls);
			messages.push({ role: 'user', content: toolResultContentForHistory });
		}

		// Build final response content
		let responseContent = fullContent;
		if (pendingActions.length > 0) {
			responseContent += '\n\n**Actions pending confirmation:**\n';
			for (const action of pendingActions) {
				responseContent += `\n- ${action.confirmationMessage}`;
			}
		}

		// Save assistant message
		const messageToolCalls = allToolCalls.length > 0
			? allToolCalls.map(tc => ({
				name: tc.name,
				params: tc.params,
				result: tc.result,
				pendingActionId: tc.pendingActionId
			}))
			: undefined;

		await addAssistantMessage(chatId, responseContent, messageToolCalls);

		log.info({ chatId, totalToolCalls: allToolCalls.length, tokensUsed, pendingActionCount: pendingActions.length }, 'CONTINUATION COMPLETE');
		yield { type: 'done', tokensUsed };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		log.error({ chatId, error: errorMessage }, 'CONTINUATION ERROR');
		yield { type: 'error', error: errorMessage };
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

// Track executed tool calls with their IDs for continuation
interface ExecutedToolCall {
	id: string;
	name: string;
	params: Record<string, unknown>;
	result: unknown;
	requiresConfirmation: boolean;
	pendingActionId?: string;
}

/**
 * Process a user message with streaming response
 * Supports multi-turn tool use - continues calling LLM until no more tool calls
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
	log.info({ chatId, userMessage: userMessage.substring(0, 100), requestingUserId }, 'STREAM START: processUserMessageStream called');

	// Get the chat session
	log.debug({ chatId }, 'STREAM: Getting chat session...');
	const session = await getChatSession(chatId);
	if (!session) {
		log.error({ chatId }, 'STREAM ERROR: Chat session not found');
		yield { type: 'error', error: `Chat session ${chatId} not found` };
		return;
	}
	log.debug({ chatId, messageCount: session.messages.length }, 'STREAM: Session retrieved');

	// Use the session's userId if requestingUserId not provided
	const userId = requestingUserId || session.userId;

	// Add user message to chat
	log.debug({ chatId }, 'STREAM: Adding user message to chat...');
	await addUserMessage(chatId, userMessage);
	log.debug({ chatId }, 'STREAM: User message added');

	// Assemble context with user permissions
	log.debug({ chatId, userId }, 'STREAM: Assembling context...');
	const context = await assembleOfficeManagerContext(3000, userId);
	log.debug({ chatId, contextLength: context.length }, 'STREAM: Context assembled');

	// Check if we need to pre-fetch staff data for scheduling requests (using config service)
	let staffContext = '';
	const shouldFetchStaff = await needsStaffContext(userMessage);
	if (shouldFetchStaff) {
		log.info({ chatId }, 'STREAM: Context trigger keywords matched, pre-fetching staff data');
		staffContext = await getStaffListForContext();
		log.debug({ chatId, staffContextLength: staffContext.length }, 'STREAM: Staff context fetched');
	}

	// Build conversation history for the LLM
	const conversationHistory = buildConversationHistory(session.messages);
	log.debug({ chatId, historyLength: conversationHistory.length }, 'STREAM: Conversation history built');

	// Build the user prompt with context
	const userPrompt = `${conversationHistory}

## Current Context
${context}
${staffContext ? '\n' + staffContext : ''}

## User Message
${userMessage}

${staffContext ? '**IMPORTANT**: Staff IDs are provided above. Use them directly with create_schedule - do NOT call get_available_staff first.' : ''}`;

	// Get tools formatted for the LLM
	const tools = officeManagerTools;

	// Check if we should force a specific tool (using database-configured keywords)
	const forcedToolName = await findForcedTool(userMessage);
	if (forcedToolName) {
		log.info({ chatId, forcedTool: forcedToolName }, 'STREAM: Force keyword matched, forcing tool');
	}

	// Make the streaming LLM request
	const request: LLMRequest = {
		model,
		systemPrompt: OFFICE_MANAGER_SYSTEM_PROMPT,
		userPrompt,
		tools,
		maxTokens: 4096, // Increased for large schedule creation
		temperature: 0.3,
		forcedTool: forcedToolName || undefined
	};

	const runId = randomUUID();
	let fullContent = '';
	const allToolCalls: ExecutedToolCall[] = [];
	const pendingActions: PendingAction[] = [];
	let tokensUsed = 0;
	const MAX_CONTINUATION_TURNS = 5; // Prevent infinite loops

	log.info({ chatId, runId, model }, 'STREAM: Starting LLM request');

	try {
		if (!anthropicProvider.stream) {
			log.error({ chatId }, 'STREAM ERROR: Streaming not supported');
			throw new Error('Streaming not supported by this provider');
		}

		// Track messages for multi-turn continuation
		// For Anthropic API, we need: user message, then assistant response with tool_use
		const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<{type: string; [key: string]: unknown}> }> = [
			{ role: 'user', content: userPrompt }
		];

		let continuationTurn = 0;
		let needsContinuation = false;
		let currentTurnToolCalls: ExecutedToolCall[] = [];
		let currentTurnContent = '';

		log.info({ chatId, promptLength: userPrompt.length, toolCount: tools.length }, 'STREAM: Calling anthropicProvider.stream');
		// First turn - use the normal stream
		let chunkCount = 0;
		for await (const chunk of anthropicProvider.stream(request)) {
			chunkCount++;
			if (chunkCount === 1) {
				log.info({ chatId }, 'STREAM: First chunk received from LLM');
			}
			if (chunk.type === 'text' && chunk.content) {
				fullContent += chunk.content;
				currentTurnContent += chunk.content;
				yield { type: 'text', content: chunk.content };
			} else if (chunk.type === 'tool_use' && chunk.toolCall) {
				const { id, name, params } = chunk.toolCall;
				const toolId = id || `tool_${randomUUID().slice(0, 8)}`;
				log.info({ toolName: name, params }, 'Tool called with params');
				yield { type: 'tool_start', toolName: name, toolParams: params };

				const tool = tools.find(t => t.name === name);
				if (!tool) {
					const result = { error: `Unknown tool: ${name}` };
					currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
					yield { type: 'tool_result', toolName: name, result };
					needsContinuation = true;
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
					currentTurnToolCalls.push({
						id: toolId,
						name,
						params,
						result: { pending: true, confirmationMessage },
						requiresConfirmation: true,
						pendingActionId: pendingAction.id
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
					// Don't continue for pending confirmations
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
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;
						continue;
					}

					try {
						const result = await tool.execute(params, executionContext);
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });

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

						// We executed a tool - need to continue the conversation
						needsContinuation = true;
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						const result = { error: errorMessage };
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;

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
				tokensUsed += chunk.usage.inputTokens + chunk.usage.outputTokens;
				log.info({ chatId, chunkCount, tokensUsed }, 'STREAM: First turn complete');
			}
		}

		log.info({ chatId, toolCallCount: currentTurnToolCalls.length, needsContinuation, contentLength: currentTurnContent.length }, 'STREAM: First turn finished, checking continuation');

		// Add tool calls from first turn to the total
		allToolCalls.push(...currentTurnToolCalls);

		// Multi-turn continuation loop
		while (needsContinuation && continuationTurn < MAX_CONTINUATION_TURNS) {
			continuationTurn++;
			needsContinuation = false;
			log.info({ chatId, turn: continuationTurn, pendingToolCalls: currentTurnToolCalls.length }, 'STREAM: Starting continuation turn');

			// Build the assistant message with tool_use blocks for the previous turn
			// IMPORTANT: Must include ALL tool_use blocks - Anthropic requires a tool_result for each one
			const assistantContent: Array<{type: string; [key: string]: unknown}> = [];
			if (currentTurnContent) {
				assistantContent.push({ type: 'text', text: currentTurnContent });
			}
			for (const tc of currentTurnToolCalls) {
				// Include ALL tool_use blocks, even confirmation-required ones
				assistantContent.push({
					type: 'tool_use',
					id: tc.id,
					name: tc.name,
					input: tc.params
				});
			}

			// Add assistant message to history
			messages.push({ role: 'assistant', content: assistantContent });

			// Build tool results for ALL tools - Anthropic requires tool_result for every tool_use
			const toolResults: ToolResult[] = currentTurnToolCalls.map(tc => ({
				toolUseId: tc.id,
				toolName: tc.name,
				// For confirmation-required tools, return the pending status as the result
				result: tc.result,
				isError: !!(tc.result && typeof tc.result === 'object' && 'error' in tc.result)
			}));

			// Reset for the next turn
			currentTurnToolCalls = [];
			currentTurnContent = '';

			// Build tool result content for adding to history after this turn completes
			const toolResultContentForHistory: Array<{type: string; [key: string]: unknown}> = toolResults.map(tr => ({
				type: 'tool_result' as const,
				tool_use_id: tr.toolUseId,
				content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
				is_error: tr.isError === true ? true : undefined // Only include if actually an error
			}));

			log.info({
				chatId,
				turn: continuationTurn,
				toolResultCount: toolResults.length,
				toolIds: toolResults.map(tr => tr.toolUseId)
			}, 'STREAM: Calling streamWithToolResults');
			// Continue the conversation with tool results
			let contChunkCount = 0;
			for await (const chunk of streamWithToolResults(request, messages, toolResults)) {
				contChunkCount++;
				if (contChunkCount === 1) {
					log.info({ chatId, turn: continuationTurn }, 'STREAM: First continuation chunk received');
				}
				if (chunk.type === 'text' && chunk.content) {
					fullContent += chunk.content;
					currentTurnContent += chunk.content;
					yield { type: 'text', content: chunk.content };
				} else if (chunk.type === 'tool_use' && chunk.toolCall) {
					const { id, name, params } = chunk.toolCall;
					const toolId = id || `tool_${randomUUID().slice(0, 8)}`;
					log.info({ toolName: name, params, turn: continuationTurn }, 'Tool called in continuation');
					yield { type: 'tool_start', toolName: name, toolParams: params };

					const tool = tools.find(t => t.name === name);
					if (!tool) {
						const result = { error: `Unknown tool: ${name}` };
						currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
						yield { type: 'tool_result', toolName: name, result };
						needsContinuation = true;
						continue;
					}

					// Same tool execution logic as first turn
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
						currentTurnToolCalls.push({
							id: toolId,
							name,
							params,
							result: { pending: true, confirmationMessage },
							requiresConfirmation: true,
							pendingActionId: pendingAction.id
						});

						yield {
							type: 'pending_action',
							toolName: name,
							pendingActionId: pendingAction.id,
							confirmationMessage
						};
					} else {
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
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
							yield { type: 'tool_result', toolName: name, result };
							needsContinuation = true;
							continue;
						}

						try {
							const result = await tool.execute(params, executionContext);
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });

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

							needsContinuation = true;
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							const result = { error: errorMessage };
							currentTurnToolCalls.push({ id: toolId, name, params, result, requiresConfirmation: false });
							yield { type: 'tool_result', toolName: name, result };
							needsContinuation = true;
						}
					}
				} else if (chunk.type === 'done' && chunk.usage) {
					tokensUsed += chunk.usage.inputTokens + chunk.usage.outputTokens;
				}
			}

			// Add this turn's tool calls to the total
			allToolCalls.push(...currentTurnToolCalls);

			// Add the tool results to message history for subsequent turns
			// This ensures Anthropic API receives complete tool_use/tool_result pairs
			messages.push({ role: 'user', content: toolResultContentForHistory });
		}

		if (continuationTurn >= MAX_CONTINUATION_TURNS) {
			log.warn({ chatId, turns: continuationTurn }, 'Hit max continuation turns limit');
		}

		// Build the full response content
		let responseContent = fullContent;
		if (pendingActions.length > 0) {
			responseContent += '\n\n**Actions pending confirmation:**\n';
			for (const action of pendingActions) {
				responseContent += `\n- ${action.confirmationMessage}`;
			}
		}

		// Save the assistant message with all tool calls
		const messageToolCalls = allToolCalls.length > 0
			? allToolCalls.map(tc => ({
				name: tc.name,
				params: tc.params,
				result: tc.result,
				pendingActionId: tc.pendingActionId
			}))
			: undefined;

		log.debug({ chatId }, 'STREAM: Saving assistant message...');
		await addAssistantMessage(chatId, responseContent, messageToolCalls);

		log.info({ chatId, totalToolCalls: allToolCalls.length, tokensUsed, pendingActionCount: pendingActions.length }, 'STREAM COMPLETE: Finished successfully');
		yield { type: 'done', tokensUsed };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;
		log.error({ chatId, error: errorMessage, stack: errorStack }, 'STREAM ERROR: Exception caught');
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
