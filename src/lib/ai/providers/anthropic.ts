// Anthropic Claude Provider
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamEvent, AITool } from '../types';
import { getAPIKey } from '../config/keys';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:anthropic');

interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
	type: 'text' | 'tool_use' | 'tool_result';
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: string;
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
		const apiKey = getAPIKey('anthropic');
		if (!apiKey) {
			throw new Error('Anthropic API key not configured');
		}

		const messages: AnthropicMessage[] = [{ role: 'user', content: request.userPrompt }];

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

		const response = await fetch('https://api.anthropic.com/v1/messages', {
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
			throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
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
		log.info({ model: request.model }, 'ANTHROPIC STREAM: Starting stream request');
		const apiKey = getAPIKey('anthropic');
		if (!apiKey) {
			log.error('ANTHROPIC STREAM: No API key configured');
			throw new Error('Anthropic API key not configured');
		}

		const messages: AnthropicMessage[] = [{ role: 'user', content: request.userPrompt }];

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

		log.info({ model: request.model, promptLength: request.userPrompt.length }, 'ANTHROPIC STREAM: Calling API...');
		const response = await fetch('https://api.anthropic.com/v1/messages', {
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
						// Debug: log all event types
						log.debug({ eventType: event.type }, 'ANTHROPIC STREAM: Event received');

						if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens || 0;
						}

						if (event.type === 'error') {
							log.error({ error: event.error }, 'ANTHROPIC STREAM: Error event received');
						}

						if (event.type === 'content_block_start') {
							if (event.content_block?.type === 'tool_use') {
								currentToolName = event.content_block.name || '';
								currentToolId = event.content_block.id || '';
								currentToolInput = '';
							}
						}

						if (event.type === 'content_block_delta') {
							if (event.delta?.type === 'text_delta' && event.delta.text) {
								yield { type: 'text', content: event.delta.text };
							} else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
								currentToolInput += event.delta.partial_json;
							}
						}

						if (event.type === 'content_block_stop' && currentToolName) {
							try {
								const params = JSON.parse(currentToolInput);
								yield { type: 'tool_use', toolCall: { id: currentToolId, name: currentToolName, params } };
							} catch {
								// Invalid JSON, skip
							}
							currentToolName = '';
							currentToolInput = '';
							currentToolId = '';
						}

						if (event.type === 'message_delta' && event.usage) {
							outputTokens = event.usage.output_tokens || 0;
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
			// Claude 4 Series (Latest - 2025)
			'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
			'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
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
	log.info({ model: request.model, toolResultCount: toolResults.length, messageCount: previousMessages.length }, 'ANTHROPIC CONTINUE: Starting continuation stream');
	const apiKey = getAPIKey('anthropic');
	if (!apiKey) {
		log.error('ANTHROPIC CONTINUE: No API key configured');
		throw new Error('Anthropic API key not configured');
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

	log.info({ model: request.model, messageCount: messages.length }, 'ANTHROPIC CONTINUE: Calling API...');
	const response = await fetch('https://api.anthropic.com/v1/messages', {
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
		log.error({ status: response.status, error: errorText }, 'ANTHROPIC CONTINUE: API error');
		throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
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
						log.debug({ inputTokens }, 'ANTHROPIC CONTINUE: Message started');
					}

					if (event.type === 'content_block_start') {
						if (event.content_block?.type === 'tool_use') {
							currentToolName = event.content_block.name || '';
							currentToolId = event.content_block.id || '';
							currentToolInput = '';
							log.debug({ toolName: currentToolName, toolId: currentToolId }, 'ANTHROPIC CONTINUE: Tool use started');
						}
					}

					if (event.type === 'content_block_delta') {
						if (event.delta?.type === 'text_delta' && event.delta.text) {
							yield { type: 'text', content: event.delta.text };
						} else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
							currentToolInput += event.delta.partial_json;
						}
					}

					if (event.type === 'content_block_stop' && currentToolName) {
						try {
							const params = JSON.parse(currentToolInput);
							log.info({ toolName: currentToolName }, 'ANTHROPIC CONTINUE: Tool call complete');
							yield { type: 'tool_use', toolCall: { id: currentToolId, name: currentToolName, params } };
						} catch {
							log.warn({ toolName: currentToolName }, 'ANTHROPIC CONTINUE: Invalid tool JSON');
						}
						currentToolName = '';
						currentToolInput = '';
						currentToolId = '';
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
