// OpenAI GPT Provider
import type { LLMProvider, LLMRequest, LLMResponse, AITool } from '../types';
import { getAPIKey } from '../config/keys';

interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface OpenAITool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, unknown>;
			required: string[];
		};
	};
}

interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAIResponse {
	choices: {
		message: {
			content: string | null;
			tool_calls?: OpenAIToolCall[];
		};
		finish_reason: 'stop' | 'tool_calls' | 'length';
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
	};
}

function convertToolsToOpenAI(tools: AITool[]): OpenAITool[] {
	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		}
	}));
}

export const openaiProvider: LLMProvider = {
	name: 'openai',

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const apiKey = getAPIKey('openai');
		if (!apiKey) {
			throw new Error('OpenAI API key not configured');
		}

		const messages: OpenAIMessage[] = [
			{ role: 'system', content: request.systemPrompt },
			{ role: 'user', content: request.userPrompt }
		];

		const body: Record<string, unknown> = {
			model: request.model,
			max_tokens: request.maxTokens || 1024,
			messages
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = convertToolsToOpenAI(request.tools);
		}

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
		}

		const data = (await response.json()) as OpenAIResponse;
		const choice = data.choices[0];

		const toolCalls = choice.message.tool_calls?.map((tc) => ({
			name: tc.function.name,
			params: JSON.parse(tc.function.arguments) as Record<string, unknown>
		}));

		return {
			content: choice.message.content || '',
			toolCalls,
			usage: {
				inputTokens: data.usage.prompt_tokens,
				outputTokens: data.usage.completion_tokens
			},
			finishReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'stop'
		};
	},

	estimateCost(inputTokens: number, outputTokens: number, model: string): number {
		const pricing: Record<string, { input: number; output: number }> = {
			'gpt-4o-mini': { input: 0.15, output: 0.6 },
			'gpt-4o': { input: 2.5, output: 10.0 },
			'gpt-4-turbo': { input: 10.0, output: 30.0 }
		};

		const price = pricing[model] || pricing['gpt-4o-mini'];
		const inputCost = (inputTokens / 1_000_000) * price.input;
		const outputCost = (outputTokens / 1_000_000) * price.output;

		return Math.ceil((inputCost + outputCost) * 100);
	}
};
