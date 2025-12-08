// Anthropic Claude Provider
import type { LLMProvider, LLMRequest, LLMResponse, AITool } from '../types';
import { getAPIKey } from '../config/keys';

interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
	type: 'text' | 'tool_use';
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
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

	estimateCost(inputTokens: number, outputTokens: number, model: string): number {
		// Prices per million tokens (as of late 2024)
		const pricing: Record<string, { input: number; output: number }> = {
			'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
			'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
			'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
			'claude-3-opus-20240229': { input: 15.0, output: 75.0 }
		};

		const price = pricing[model] || pricing['claude-3-haiku-20240307'];
		const inputCost = (inputTokens / 1_000_000) * price.input;
		const outputCost = (outputTokens / 1_000_000) * price.output;

		return Math.ceil((inputCost + outputCost) * 100); // Return cents
	}
};
