// Segmind Provider
// Segmind uses model-specific endpoints with x-api-key authentication
import type { LLMProvider, LLMRequest, LLMResponse, AITool } from '../types';
import { getAPIKey } from '../config/keys';

interface SegmindMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface SegmindTool {
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

interface SegmindToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

interface SegmindResponse {
	choices: {
		message: {
			content: string | null;
			tool_calls?: SegmindToolCall[];
		};
		finish_reason: 'stop' | 'tool_calls' | 'length';
	}[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
	};
}

// Map model names to Segmind endpoint slugs
const MODEL_SLUG_MAP: Record<string, string> = {
	// Claude models via Segmind
	'segmind-claude-4.5-sonnet': 'claude-4.5-sonnet',
	'segmind-claude-4-sonnet': 'claude-4-sonnet',
	'segmind-claude-3.5-sonnet': 'claude-3.5-sonnet',
	// GPT models via Segmind
	'segmind-gpt-5': 'gpt-5',
	'segmind-gpt-5-mini': 'gpt-5-mini',
	'segmind-gpt-5-nano': 'gpt-5-nano',
	'segmind-gpt-4o': 'gpt-4o',
	'segmind-gpt-4-turbo': 'gpt-4-turbo',
	// Gemini models via Segmind
	'segmind-gemini-3-pro': 'gemini-3-pro',
	'segmind-gemini-2.5-pro': 'gemini-2.5-pro',
	'segmind-gemini-2.5-flash': 'gemini-2.5-flash',
	// DeepSeek models
	'segmind-deepseek-chat': 'deepseek-chat',
	'segmind-deepseek-r1': 'deepseek-reasoner',
	// Llama models
	'segmind-llama-3.1-405b': 'llama-v3p1-405b-instruct',
	'segmind-llama-3.1-70b': 'llama-v3p1-70b-instruct',
	'segmind-llama-3.1-8b': 'llama-v3p1-8b-instruct',
	// Kimi
	'segmind-kimi-k2': 'kimi-k2-instruct-0905'
};

function convertToolsToSegmind(tools: AITool[]): SegmindTool[] {
	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		}
	}));
}

function getEndpointSlug(model: string): string {
	return MODEL_SLUG_MAP[model] || model.replace('segmind-', '');
}

export const segmindProvider: LLMProvider = {
	name: 'segmind',

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const apiKey = getAPIKey('segmind');
		if (!apiKey) {
			throw new Error('Segmind API key not configured');
		}

		const slug = getEndpointSlug(request.model);
		const url = `https://api.segmind.com/v1/${slug}`;

		const messages: SegmindMessage[] = [
			{ role: 'system', content: request.systemPrompt },
			{ role: 'user', content: request.userPrompt }
		];

		const body: Record<string, unknown> = {
			messages,
			max_tokens: request.maxTokens || 1024
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = convertToolsToSegmind(request.tools);
		}

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Segmind API error: ${response.status} - ${errorText}`);
		}

		const data = (await response.json()) as SegmindResponse;
		const choice = data.choices?.[0];

		if (!choice) {
			throw new Error('No response from Segmind API');
		}

		const toolCalls = choice.message.tool_calls?.map((tc) => ({
			name: tc.function.name,
			params: JSON.parse(tc.function.arguments) as Record<string, unknown>
		}));

		return {
			content: choice.message.content || '',
			toolCalls,
			usage: {
				inputTokens: data.usage?.prompt_tokens || 0,
				outputTokens: data.usage?.completion_tokens || 0
			},
			finishReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'stop'
		};
	},

	estimateCost(inputTokens: number, outputTokens: number, model: string): number {
		// Segmind pricing varies by model - costs are approximate averages per request
		// These are estimated per-million-token costs based on Segmind's pricing
		const pricing: Record<string, { input: number; output: number }> = {
			// Claude models (higher cost)
			'segmind-claude-4.5-sonnet': { input: 3.0, output: 15.0 },
			'segmind-claude-4-sonnet': { input: 3.0, output: 15.0 },
			'segmind-claude-3.5-sonnet': { input: 3.0, output: 15.0 },
			// GPT models
			'segmind-gpt-5': { input: 5.0, output: 15.0 },
			'segmind-gpt-5-mini': { input: 0.15, output: 0.6 },
			'segmind-gpt-5-nano': { input: 0.1, output: 0.4 },
			'segmind-gpt-4o': { input: 2.5, output: 10.0 },
			'segmind-gpt-4-turbo': { input: 10.0, output: 30.0 },
			// Gemini models
			'segmind-gemini-3-pro': { input: 1.25, output: 5.0 },
			'segmind-gemini-2.5-pro': { input: 1.25, output: 5.0 },
			'segmind-gemini-2.5-flash': { input: 0.075, output: 0.3 },
			// DeepSeek models (very cheap)
			'segmind-deepseek-chat': { input: 0.14, output: 0.28 },
			'segmind-deepseek-r1': { input: 0.55, output: 2.19 },
			// Llama models
			'segmind-llama-3.1-405b': { input: 3.0, output: 3.0 },
			'segmind-llama-3.1-70b': { input: 0.9, output: 0.9 },
			'segmind-llama-3.1-8b': { input: 0.2, output: 0.2 },
			// Kimi
			'segmind-kimi-k2': { input: 0.6, output: 2.4 }
		};

		const price = pricing[model] || { input: 1.0, output: 3.0 }; // Default pricing
		const inputCost = (inputTokens / 1_000_000) * price.input;
		const outputCost = (outputTokens / 1_000_000) * price.output;

		return Math.ceil((inputCost + outputCost) * 100); // Return cents
	}
};
