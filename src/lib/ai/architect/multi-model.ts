// Multi-Model Consultation for Ada
// Implements tiered consultation: Quick → Standard → Deliberate
import type { AIProvider } from '../types';
import { getAPIKey } from '../config/keys';

export type ConsultationTier = 'quick' | 'standard' | 'deliberate';

export interface ModelConfig {
	provider: AIProvider;
	model: string;
}

export interface DeliberationConfig {
	primary: ModelConfig;
	review: ModelConfig;
	synthesizer: ModelConfig;
}

export interface LLMCallResult {
	content: string;
	toolCalls?: { name: string; params: unknown }[];
	inputTokens: number;
	outputTokens: number;
	costCents: number;
}

export interface ConsultationResult {
	tier: ConsultationTier;
	reason: string;
	primary: {
		provider: AIProvider;
		model: string;
		response: LLMCallResult;
	};
	review?: {
		provider: AIProvider;
		model: string;
		response: LLMCallResult;
	};
	synthesis?: {
		provider: AIProvider;
		model: string;
		response: LLMCallResult;
	};
	finalContent: string;
	finalToolCalls?: { name: string; params: unknown }[];
	totalCostCents: number;
	totalTokens: number;
}

// Cost estimation per model (in dollars per million tokens)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
	// Anthropic
	'claude-opus-4-20250514': { input: 15, output: 75 },
	'claude-sonnet-4-20250514': { input: 3, output: 15 },
	'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
	'claude-3-opus-20240229': { input: 15, output: 75 },
	'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
	// OpenAI
	'gpt-4o': { input: 2.5, output: 10 },
	'gpt-4-turbo-preview': { input: 10, output: 30 },
	'gpt-4': { input: 30, output: 60 },
};

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
	const costs = MODEL_COSTS[model] || { input: 3, output: 15 }; // Default to Sonnet pricing
	const inputCost = (inputTokens / 1_000_000) * costs.input;
	const outputCost = (outputTokens / 1_000_000) * costs.output;
	return Math.ceil((inputCost + outputCost) * 100); // Convert to cents
}

// Call Anthropic API
async function callAnthropic(
	model: string,
	systemPrompt: string,
	userPrompt: string,
	tools?: { name: string; description: string; parameters: object }[],
	temperature: number = 0.4,
	maxTokens: number = 4096
): Promise<LLMCallResult> {
	const apiKey = getAPIKey('anthropic');
	if (!apiKey) {
		throw new Error('Anthropic API key not configured');
	}

	const body: Record<string, unknown> = {
		model,
		max_tokens: maxTokens,
		system: systemPrompt,
		messages: [{ role: 'user', content: userPrompt }],
		temperature
	};

	if (tools && tools.length > 0) {
		body.tools = tools.map(t => ({
			name: t.name,
			description: t.description,
			input_schema: t.parameters
		}));
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
		const error = await response.text();
		throw new Error(`Anthropic API error: ${error}`);
	}

	const data = await response.json();

	let content = '';
	const toolCalls: { name: string; params: unknown }[] = [];

	for (const block of data.content) {
		if (block.type === 'text') {
			content += block.text;
		} else if (block.type === 'tool_use') {
			toolCalls.push({
				name: block.name,
				params: block.input
			});
		}
	}

	const inputTokens = data.usage?.input_tokens || 0;
	const outputTokens = data.usage?.output_tokens || 0;

	return {
		content,
		toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		inputTokens,
		outputTokens,
		costCents: estimateCost(inputTokens, outputTokens, model)
	};
}

// Call OpenAI API
async function callOpenAI(
	model: string,
	systemPrompt: string,
	userPrompt: string,
	tools?: { name: string; description: string; parameters: object }[],
	temperature: number = 0.4,
	maxTokens: number = 4096
): Promise<LLMCallResult> {
	const apiKey = getAPIKey('openai');
	if (!apiKey) {
		throw new Error('OpenAI API key not configured');
	}

	const body: Record<string, unknown> = {
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		temperature,
		max_tokens: maxTokens
	};

	if (tools && tools.length > 0) {
		body.tools = tools.map(t => ({
			type: 'function',
			function: {
				name: t.name,
				description: t.description,
				parameters: t.parameters
			}
		}));
		body.tool_choice = 'auto';
	}

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${error}`);
	}

	const data = await response.json();
	const choice = data.choices[0];

	const toolCalls: { name: string; params: unknown }[] = [];
	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			toolCalls.push({
				name: tc.function.name,
				params: JSON.parse(tc.function.arguments)
			});
		}
	}

	const inputTokens = data.usage?.prompt_tokens || 0;
	const outputTokens = data.usage?.completion_tokens || 0;

	return {
		content: choice.message.content || '',
		toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		inputTokens,
		outputTokens,
		costCents: estimateCost(inputTokens, outputTokens, model)
	};
}

// Call LLM based on provider
async function callLLM(
	provider: AIProvider,
	model: string,
	systemPrompt: string,
	userPrompt: string,
	tools?: { name: string; description: string; parameters: object }[],
	temperature?: number,
	maxTokens?: number
): Promise<LLMCallResult> {
	if (provider === 'anthropic') {
		return callAnthropic(model, systemPrompt, userPrompt, tools, temperature, maxTokens);
	} else if (provider === 'openai') {
		return callOpenAI(model, systemPrompt, userPrompt, tools, temperature, maxTokens);
	}
	throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Quick consultation - single fast model for simple questions
 */
export async function quickConsultation(
	systemPrompt: string,
	userPrompt: string,
	tools: { name: string; description: string; parameters: object }[],
	config: ModelConfig,
	reason: string
): Promise<ConsultationResult> {
	const response = await callLLM(
		config.provider,
		config.model,
		systemPrompt,
		userPrompt,
		tools,
		0.4,
		2048
	);

	return {
		tier: 'quick',
		reason,
		primary: {
			provider: config.provider,
			model: config.model,
			response
		},
		finalContent: response.content,
		finalToolCalls: response.toolCalls,
		totalCostCents: response.costCents,
		totalTokens: response.inputTokens + response.outputTokens
	};
}

/**
 * Standard consultation - single powerful model for normal discussion
 */
export async function standardConsultation(
	systemPrompt: string,
	userPrompt: string,
	tools: { name: string; description: string; parameters: object }[],
	config: ModelConfig,
	reason: string
): Promise<ConsultationResult> {
	const response = await callLLM(
		config.provider,
		config.model,
		systemPrompt,
		userPrompt,
		tools,
		0.4,
		4096
	);

	return {
		tier: 'standard',
		reason,
		primary: {
			provider: config.provider,
			model: config.model,
			response
		},
		finalContent: response.content,
		finalToolCalls: response.toolCalls,
		totalCostCents: response.costCents,
		totalTokens: response.inputTokens + response.outputTokens
	};
}

/**
 * Deliberate consultation - multi-model consultation for major decisions
 * Flow: Primary (Opus) → Review (GPT-4o) → Synthesis (Sonnet)
 */
export async function deliberateConsultation(
	systemPrompt: string,
	userPrompt: string,
	tools: { name: string; description: string; parameters: object }[],
	config: DeliberationConfig,
	reason: string
): Promise<ConsultationResult> {
	let totalCostCents = 0;
	let totalTokens = 0;

	// Step 1: Primary recommendation
	console.log('[Deliberation] Step 1: Getting primary recommendation from', config.primary.model);
	const primaryResponse = await callLLM(
		config.primary.provider,
		config.primary.model,
		systemPrompt,
		userPrompt,
		tools,
		0.4,
		4096
	);
	totalCostCents += primaryResponse.costCents;
	totalTokens += primaryResponse.inputTokens + primaryResponse.outputTokens;

	// Step 2: Peer review (try, but don't fail if unavailable)
	let reviewResponse: LLMCallResult | undefined;
	try {
		console.log('[Deliberation] Step 2: Getting peer review from', config.review.model);
		const reviewSystemPrompt = `You are a senior software architect providing peer review on another architect's recommendation. Be constructive, specific, and thorough. Focus on:
- Potential issues or risks not addressed
- Alternative approaches that might be better
- Areas where you agree the proposal is sound
- Specific improvements to suggest

Do not be contrarian for its own sake. If the proposal is good, say so and add value where you can.`;

		const reviewUserPrompt = `## Original Question
${userPrompt}

## Proposed Solution
${primaryResponse.content}

Please review this architectural recommendation.`;

		reviewResponse = await callLLM(
			config.review.provider,
			config.review.model,
			reviewSystemPrompt,
			reviewUserPrompt,
			[], // No tools for review
			0.3,
			2048
		);
		totalCostCents += reviewResponse.costCents;
		totalTokens += reviewResponse.inputTokens + reviewResponse.outputTokens;
	} catch (error) {
		console.error('[Deliberation] Review step failed, continuing with primary only:', error);
		// Fall back to standard consultation if review fails
		return {
			tier: 'deliberate',
			reason: reason + ' (review failed, using primary only)',
			primary: {
				provider: config.primary.provider,
				model: config.primary.model,
				response: primaryResponse
			},
			finalContent: primaryResponse.content,
			finalToolCalls: primaryResponse.toolCalls,
			totalCostCents,
			totalTokens
		};
	}

	// Step 3: Synthesis
	console.log('[Deliberation] Step 3: Synthesizing responses with', config.synthesizer.model);
	const synthUserPrompt = `You are Ada, synthesizing two expert architectural opinions into a final recommendation.

## Original Question
${userPrompt}

## Primary Recommendation
${primaryResponse.content}

## Peer Review
${reviewResponse.content}

## Your Task
Create a unified, actionable recommendation that:
1. Incorporates valid critiques from the review
2. Preserves strengths of the primary recommendation
3. Resolves any conflicts with clear reasoning
4. Presents the final answer as YOUR recommendation

Speak as Ada giving the definitive answer. Don't say "the first model suggested" or "the reviewer noted" - just give the best synthesized answer as if it were your own conclusion.

If the primary recommendation had tool calls (like creating prompts or ADRs), include those in your response if they're still appropriate after considering the review.`;

	const synthResponse = await callLLM(
		config.synthesizer.provider,
		config.synthesizer.model,
		systemPrompt,
		synthUserPrompt,
		tools,
		0.3,
		4096
	);
	totalCostCents += synthResponse.costCents;
	totalTokens += synthResponse.inputTokens + synthResponse.outputTokens;

	return {
		tier: 'deliberate',
		reason,
		primary: {
			provider: config.primary.provider,
			model: config.primary.model,
			response: primaryResponse
		},
		review: {
			provider: config.review.provider,
			model: config.review.model,
			response: reviewResponse
		},
		synthesis: {
			provider: config.synthesizer.provider,
			model: config.synthesizer.model,
			response: synthResponse
		},
		finalContent: synthResponse.content,
		finalToolCalls: synthResponse.toolCalls || primaryResponse.toolCalls,
		totalCostCents,
		totalTokens
	};
}
