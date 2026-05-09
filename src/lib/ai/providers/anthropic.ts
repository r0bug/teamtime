// Anthropic Claude Provider
// Also routes deepseek-* models to DeepSeek's Anthropic-compatible endpoint.
import type { AIProvider, LLMProvider, LLMRequest, LLMResponse, LLMStreamEvent, AITool } from '../types';
import { getAPIKey } from '../config/keys';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:anthropic');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/anthropic/v1/messages';

/**
 * DeepSeek's `/anthropic` endpoint speaks the same JSON shape as Anthropic
 * (same content blocks, tool_use/tool_result, streaming events). We can reuse
 * this provider for both — route by model prefix.
 */
function routeForModel(model: string): { apiUrl: string; providerKey: AIProvider } {
	if (model.startsWith('deepseek-')) {
		return { apiUrl: DEEPSEEK_API_URL, providerKey: 'deepseek' };
	}
	return { apiUrl: ANTHROPIC_API_URL, providerKey: 'anthropic' };
}

/** Public: which provider serves a given model. Used for token-usage logging. */
export function providerForModel(model: string): AIProvider {
	return routeForModel(model).providerKey;
}

export interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
	type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: string;
	// thinking / redacted_thinking
	thinking?: string;
	signature?: string;
	data?: string;
}

interface AnthropicTool {
	name: string;
	description: string;
	input_schema: {
		type: 'object';
		properties: Record<string, unknown>;
		required: string[];
	};
}

interface AnthropicResponse {
	content: AnthropicContentBlock[];
	stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
	usage: {
		input_tokens: number;
		output_tokens: number;
	};
}

function convertToolsToAnthropic(tools: AITool[]): AnthropicTool[] {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: tool.parameters
	}));
}

// Tool result structure for multi-turn conversations
export interface ToolResult {
	toolUseId: string;
	toolName: string;
	result: unknown;
	isError?: boolean;
}

// Multi-turn message for continuation
export interface ConversationMessage {
	role: 'user' | 'assistant';
	content: string;
	toolCalls?: Array<{ id: string; name: string; params: Record<string, unknown> }>;
}

export const anthropicProvider: LLMProvider = {
	name: 'anthropic',

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const { apiUrl, providerKey } = routeForModel(request.model);
		const apiKey = getAPIKey(providerKey);
		if (!apiKey) {
			throw new Error(`${providerKey} API key not configured`);
		}

		const messages: AnthropicMessage[] = request.messages
			? request.messages.map((m) => ({ role: m.role, content: m.content }))
			: [{ role: 'user', content: request.userPrompt }];

		const body: Record<string, unknown> = {
			model: request.model,
			max_tokens: request.maxTokens || 1024,
			system: request.systemPrompt,
			messages
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = convertToolsToAnthropic(request.tools);
		}

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`${providerKey} API error: ${response.status} - ${errorText}`);
		}

		const data = (await response.json()) as AnthropicResponse;

		// Extract content and tool calls
		let content = '';
		const toolCalls: { name: string; params: Record<string, unknown> }[] = [];

		for (const block of data.content) {
			if (block.type === 'text' && block.text) {
				content += block.text;
			} else if (block.type === 'tool_use' && block.name && block.input) {
				toolCalls.push({
					name: block.name,
					params: block.input
				});
			}
		}

		return {
			content,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			usage: {
				inputTokens: data.usage.input_tokens,
				outputTokens: data.usage.output_tokens
			},
			finishReason: data.stop_reason === 'tool_use' ? 'tool_use' : 'stop'
		};
	},

	async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
		const { apiUrl, providerKey } = routeForModel(request.model);
		log.info({ model: request.model, providerKey }, 'ANTHROPIC STREAM: Starting stream request');
		const apiKey = getAPIKey(providerKey);
		if (!apiKey) {
			log.error({ providerKey }, 'ANTHROPIC STREAM: No API key configured');
			throw new Error(`${providerKey} API key not configured`);
		}

		const messages: AnthropicMessage[] = request.messages
			? request.messages.map((m) => ({ role: m.role, content: m.content }))
			: [{ role: 'user', content: request.userPrompt }];

		const body: Record<string, unknown> = {
			model: request.model,
			max_tokens: request.maxTokens || 1024,
			system: request.systemPrompt,
			messages,
			stream: true
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = convertToolsToAnthropic(request.tools);

			// Force a specific tool if requested
			if (request.forcedTool) {
				body.tool_choice = { type: 'tool', name: request.forcedTool };
				log.info({ toolCount: request.tools.length, forcedTool: request.forcedTool }, 'ANTHROPIC STREAM: Tools attached with forced tool');
			} else {
				log.debug({ toolCount: request.tools.length }, 'ANTHROPIC STREAM: Tools attached');
			}
		}

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		log.info({ model: request.model, promptLength: request.userPrompt.length, apiUrl }, 'ANTHROPIC STREAM: Calling API...');
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			log.error({ status: response.status, error: errorText }, 'ANTHROPIC STREAM: API error');
			throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
		}

		log.info({ status: response.status }, 'ANTHROPIC STREAM: Got response, starting to read stream');

		if (!response.body) {
			log.error('ANTHROPIC STREAM: No response body');
			throw new Error('No response body');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let currentToolName = '';
		let currentToolInput = '';
		let currentToolId = '';
		let currentThinkingType: 'thinking' | 'redacted_thinking' | null = null;
		let currentThinkingText = '';
		let currentThinkingSignature = '';
		let currentThinkingData = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let chunkCount = 0;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					log.info({ chunkCount }, 'ANTHROPIC STREAM: Stream ended');
					break;
				}
				chunkCount++;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6);
					if (data === '[DONE]') continue;

					try {
						const event = JSON.parse(data);

						if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens || 0;
						}

						if (event.type === 'error') {
							log.error({ error: event.error }, 'ANTHROPIC STREAM: Error event received');
						}

						if (event.type === 'content_block_start') {
							const bt = event.content_block?.type;
							if (bt === 'tool_use') {
								currentToolName = event.content_block.name || '';
								currentToolId = event.content_block.id || '';
								currentToolInput = '';
							} else if (bt === 'thinking' || bt === 'redacted_thinking') {
								currentThinkingType = bt;
								currentThinkingText = '';
								currentThinkingSignature = '';
								currentThinkingData = event.content_block.data || '';
							}
						}

						if (event.type === 'content_block_delta') {
							if (event.delta?.type === 'text_delta' && event.delta.text) {
								yield { type: 'text', content: event.delta.text };
							} else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
								currentToolInput += event.delta.partial_json;
							} else if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') {
								currentThinkingText += event.delta.thinking;
							} else if (event.delta?.type === 'signature_delta' && typeof event.delta.signature === 'string') {
								currentThinkingSignature += event.delta.signature;
							}
						}

						if (event.type === 'content_block_stop' && currentToolName) {
							try {
								const jsonToParse = currentToolInput.trim() || '{}';
								const params = JSON.parse(jsonToParse);
								yield { type: 'tool_use', toolCall: { id: currentToolId, name: currentToolName, params } };
							} catch (parseError) {
								log.error({ currentToolName, currentToolInput, parseError: parseError instanceof Error ? parseError.message : 'Unknown' }, 'ANTHROPIC STREAM: Failed to parse tool JSON');
							}
							currentToolName = '';
							currentToolInput = '';
							currentToolId = '';
						} else if (event.type === 'content_block_stop' && currentThinkingType) {
							yield {
								type: 'thinking',
								thinkingBlock: currentThinkingType === 'redacted_thinking'
									? { type: 'redacted_thinking', data: currentThinkingData }
									: {
										type: 'thinking',
										thinking: currentThinkingText,
										...(currentThinkingSignature ? { signature: currentThinkingSignature } : {})
									}
							};
							currentThinkingType = null;
							currentThinkingText = '';
							currentThinkingSignature = '';
							currentThinkingData = '';
						}

						if (event.type === 'message_delta' && event.usage) {
							outputTokens = event.usage.output_tokens || 0;
							log.info({ outputTokens }, 'ANTHROPIC STREAM: message_delta with usage');
						}

						if (event.type === 'message_stop') {
							yield { type: 'done', usage: { inputTokens, outputTokens } };
						}
					} catch {
						// Invalid JSON line, skip
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	},

	estimateCost(inputTokens: number, outputTokens: number, model: string): number {
		// Prices per million tokens (as of 2025)
		const pricing: Record<string, { input: number; output: number }> = {
			// Claude 4.x Series (Latest - 2025/2026)
			'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
			'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
			'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
			// Claude 3.5 Series
			'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
			'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
			// Claude 3 Series (Legacy)
			'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
			'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
			'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
		};

		const price = pricing[model] || pricing['claude-3-haiku-20240307'];
		const inputCost = (inputTokens / 1_000_000) * price.input;
		const outputCost = (outputTokens / 1_000_000) * price.output;

		return Math.ceil((inputCost + outputCost) * 100); // Return cents
	}
};

/**
 * Stream continuation with tool results
 * Used when we need to continue after tool execution
 */
export async function* streamWithToolResults(
	request: LLMRequest,
	previousMessages: AnthropicMessage[],
	toolResults: ToolResult[]
): AsyncGenerator<LLMStreamEvent> {
	const { apiUrl, providerKey } = routeForModel(request.model);
	log.info({ model: request.model, providerKey, toolResultCount: toolResults.length, messageCount: previousMessages.length }, 'ANTHROPIC CONTINUE: Starting continuation stream');
	const apiKey = getAPIKey(providerKey);
	if (!apiKey) {
		log.error({ providerKey }, 'ANTHROPIC CONTINUE: No API key configured');
		throw new Error(`${providerKey} API key not configured`);
	}

	// Build the tool results as a user message with tool_result content blocks
	const toolResultContent: AnthropicContentBlock[] = toolResults.map(tr => ({
		type: 'tool_result' as const,
		tool_use_id: tr.toolUseId,
		content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
		is_error: tr.isError === true ? true : undefined // Only include if true
	}));

	log.debug({ toolResults: toolResults.map(tr => ({ id: tr.toolUseId, name: tr.toolName, isError: tr.isError })) }, 'ANTHROPIC CONTINUE: Tool results');

	// Add tool results as a user message
	const messages: AnthropicMessage[] = [
		...previousMessages,
		{ role: 'user', content: toolResultContent }
	];

	// Debug: Log full message structure
	log.info({
		messageCount: messages.length,
		messageStructure: messages.map((m, i) => ({
			index: i,
			role: m.role,
			contentType: typeof m.content === 'string' ? 'string' : 'array',
			contentLength: typeof m.content === 'string' ? m.content.length : (m.content as unknown[]).length,
			blocks: typeof m.content !== 'string' ? (m.content as AnthropicContentBlock[]).map(b => ({ type: b.type, id: b.id || b.tool_use_id })) : undefined
		}))
	}, 'ANTHROPIC CONTINUE: Full message structure being sent');

	const body: Record<string, unknown> = {
		model: request.model,
		max_tokens: request.maxTokens || 1024,
		system: request.systemPrompt,
		messages,
		stream: true
	};

	if (request.tools && request.tools.length > 0) {
		body.tools = convertToolsToAnthropic(request.tools);
	}

	if (request.temperature !== undefined) {
		body.temperature = request.temperature;
	}

	log.info({ model: request.model, messageCount: messages.length, apiUrl }, 'ANTHROPIC CONTINUE: Calling API...');
	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorText = await response.text();
		log.error({ status: response.status, error: errorText, providerKey }, 'ANTHROPIC CONTINUE: API error');
		throw new Error(`${providerKey} API error: ${response.status} - ${errorText}`);
	}

	log.info({ status: response.status }, 'ANTHROPIC CONTINUE: Got response, starting to read stream');

	if (!response.body) {
		log.error('ANTHROPIC CONTINUE: No response body');
		throw new Error('No response body');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let currentToolName = '';
	let currentToolInput = '';
	let currentToolId = '';
	let currentThinkingType: 'thinking' | 'redacted_thinking' | null = null;
	let currentThinkingText = '';
	let currentThinkingSignature = '';
	let currentThinkingData = '';
	let inputTokens = 0;
	let outputTokens = 0;
	let chunkCount = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				log.info({ chunkCount }, 'ANTHROPIC CONTINUE: Stream ended');
				break;
			}
			chunkCount++;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6);
				if (data === '[DONE]') continue;

				try {
					const event = JSON.parse(data);

					if (event.type === 'message_start' && event.message?.usage) {
						inputTokens = event.message.usage.input_tokens || 0;
					}

					if (event.type === 'content_block_start') {
						const bt = event.content_block?.type;
						if (bt === 'tool_use') {
							currentToolName = event.content_block.name || '';
							currentToolId = event.content_block.id || '';
							currentToolInput = '';
						} else if (bt === 'thinking' || bt === 'redacted_thinking') {
							currentThinkingType = bt;
							currentThinkingText = '';
							currentThinkingSignature = '';
							currentThinkingData = event.content_block.data || '';
						}
					}

					if (event.type === 'content_block_delta') {
						if (event.delta?.type === 'text_delta' && event.delta.text) {
							yield { type: 'text', content: event.delta.text };
						} else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
							currentToolInput += event.delta.partial_json;
						} else if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') {
							currentThinkingText += event.delta.thinking;
						} else if (event.delta?.type === 'signature_delta' && typeof event.delta.signature === 'string') {
							currentThinkingSignature += event.delta.signature;
						}
					}

					if (event.type === 'content_block_stop' && currentToolName) {
						try {
							const jsonToParse = currentToolInput.trim() || '{}';
							const params = JSON.parse(jsonToParse);
							yield { type: 'tool_use', toolCall: { id: currentToolId, name: currentToolName, params } };
						} catch {
							log.warn({ toolName: currentToolName, currentToolInput }, 'ANTHROPIC CONTINUE: Invalid tool JSON');
						}
						currentToolName = '';
						currentToolInput = '';
						currentToolId = '';
					} else if (event.type === 'content_block_stop' && currentThinkingType) {
						yield {
							type: 'thinking',
							thinkingBlock: currentThinkingType === 'redacted_thinking'
								? { type: 'redacted_thinking', data: currentThinkingData }
								: {
									type: 'thinking',
									thinking: currentThinkingText,
									...(currentThinkingSignature ? { signature: currentThinkingSignature } : {})
								}
						};
						currentThinkingType = null;
						currentThinkingText = '';
						currentThinkingSignature = '';
						currentThinkingData = '';
					}

					if (event.type === 'message_delta' && event.usage) {
						outputTokens = event.usage.output_tokens || 0;
					}

					if (event.type === 'message_stop') {
						log.info({ inputTokens, outputTokens }, 'ANTHROPIC CONTINUE: Message complete');
						yield { type: 'done', usage: { inputTokens, outputTokens } };
					}
				} catch {
					// Invalid JSON line, skip
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
