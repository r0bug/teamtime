// Multi-Model Consultation for Ada
// Implements tiered consultation: Quick → Standard → Deliberate
import type { AIProvider } from '../types';
import { getAPIKey } from '../config/keys';
import { executeArchitectTool } from './tools';

/**
 * Fetch with retry for rate limit handling
 * Retries on HTTP 429 with exponential backoff
 */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	maxRetries: number = 2
): Promise<Response> {
	let lastError: Error | null = null;
	let baseDelay = 3; // Start with 3 seconds

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const response = await fetch(url, options);

		if (response.status === 429) {
			// Rate limited - check retry-after header or use shorter backoff
			const retryAfter = response.headers.get('retry-after');
			let waitSeconds = retryAfter ? Math.min(parseInt(retryAfter, 10), 10) : baseDelay * attempt;

			// Cap wait time at 10 seconds to avoid timeouts
			if (isNaN(waitSeconds) || waitSeconds <= 0) {
				waitSeconds = baseDelay * attempt;
			}
			waitSeconds = Math.min(waitSeconds, 10);

			console.warn(`[Ada] Rate limited (429). Waiting ${waitSeconds}s before retry ${attempt}/${maxRetries}`);

			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
			lastError = new Error(`Rate limited after ${attempt} attempts`);
			continue;
		}

		if (!response.ok) {
			// Non-429 error - throw immediately
			const errorText = await response.text();
			throw new Error(`API error (${response.status}): ${errorText}`);
		}

		// Success
		return response;
	}

	// All retries exhausted
	throw new Error(`Rate limit exceeded after ${maxRetries} retries. Please wait a minute and try again. ${lastError?.message || ''}`);
}

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
	// Anthropic - Claude 4 Series (Latest - 2025)
	'claude-opus-4-20250514': { input: 15, output: 75 },
	'claude-sonnet-4-20250514': { input: 3, output: 15 },
	// Anthropic - Claude 3.5 Series
	'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
	'claude-3-5-haiku-20241022': { input: 1, output: 5 },
	// Anthropic - Claude 3 Series (Legacy)
	'claude-3-opus-20240229': { input: 15, output: 75 },
	'claude-3-sonnet-20240229': { input: 3, output: 15 },
	'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
	// OpenAI - GPT-4o Series
	'gpt-4o': { input: 2.5, output: 10 },
	'gpt-4o-mini': { input: 0.15, output: 0.6 },
	'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
	'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
	// OpenAI - o1 Reasoning Series
	'o1': { input: 15, output: 60 },
	'o1-mini': { input: 3, output: 12 },
	'o1-preview': { input: 15, output: 60 },
	// OpenAI - o3 Series (2025)
	'o3-mini': { input: 1.1, output: 4.4 },
	// OpenAI - GPT-4 Turbo/Legacy
	'gpt-4-turbo': { input: 10, output: 30 },
	'gpt-4-turbo-preview': { input: 10, output: 30 },
	'gpt-4': { input: 30, output: 60 },
	'gpt-4-32k': { input: 60, output: 120 },
	// OpenAI - GPT-3.5 Turbo
	'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
	'gpt-3.5-turbo-16k': { input: 1, output: 2 },
	// Segmind - Claude models
	'segmind-claude-4.5-sonnet': { input: 3, output: 15 },
	'segmind-claude-4-sonnet': { input: 3, output: 15 },
	'segmind-claude-3.5-sonnet': { input: 3, output: 15 },
	// Segmind - GPT models
	'segmind-gpt-5': { input: 5, output: 15 },
	'segmind-gpt-5-mini': { input: 0.15, output: 0.6 },
	'segmind-gpt-5-nano': { input: 0.1, output: 0.4 },
	'segmind-gpt-4o': { input: 2.5, output: 10 },
	'segmind-gpt-4-turbo': { input: 10, output: 30 },
	// Segmind - Gemini models
	'segmind-gemini-3-pro': { input: 1.25, output: 5 },
	'segmind-gemini-2.5-pro': { input: 1.25, output: 5 },
	'segmind-gemini-2.5-flash': { input: 0.075, output: 0.3 },
	// Segmind - DeepSeek models
	'segmind-deepseek-chat': { input: 0.14, output: 0.28 },
	'segmind-deepseek-r1': { input: 0.55, output: 2.19 },
	// Segmind - Llama models
	'segmind-llama-3.1-405b': { input: 3, output: 3 },
	'segmind-llama-3.1-70b': { input: 0.9, output: 0.9 },
	'segmind-llama-3.1-8b': { input: 0.2, output: 0.2 },
	// Segmind - Kimi
	'segmind-kimi-k2': { input: 0.6, output: 2.4 }
};

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
	const costs = MODEL_COSTS[model] || { input: 3, output: 15 }; // Default to Sonnet pricing
	const inputCost = (inputTokens / 1_000_000) * costs.input;
	const outputCost = (outputTokens / 1_000_000) * costs.output;
	return Math.ceil((inputCost + outputCost) * 100); // Convert to cents
}

// Call Anthropic API with tool use loop
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

	const formattedTools = tools?.map(t => ({
		name: t.name,
		description: t.description,
		input_schema: t.parameters
	}));

	// Build initial messages
	const messages: Array<{ role: string; content: unknown }> = [
		{ role: 'user', content: userPrompt }
	];

	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let finalContent = '';
	const allToolCalls: { name: string; params: unknown }[] = [];

	// Tool use loop - keep calling until model stops using tools
	const MAX_TOOL_ITERATIONS = 5;
	let iterations = 0;

	while (iterations < MAX_TOOL_ITERATIONS) {
		iterations++;

		const body: Record<string, unknown> = {
			model,
			max_tokens: maxTokens,
			system: systemPrompt,
			messages,
			temperature
		};

		if (formattedTools && formattedTools.length > 0) {
			body.tools = formattedTools;
		}

		// Log estimated token usage
		const bodyStr = JSON.stringify(body);
		const estimatedTokens = Math.ceil(bodyStr.length / 4);
		console.log(`[Ada] Iteration ${iterations}: ~${estimatedTokens} tokens (${bodyStr.length} chars)`);

		// If we're way over the limit, bail early
		if (estimatedTokens > 25000) {
			console.error(`[Ada] Request too large (~${estimatedTokens} tokens), aborting`);
			throw new Error('Request too large - context exceeds token limits. Try a simpler query.');
		}

		const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		console.log(`[Ada] Response stop_reason: ${data.stop_reason}`);
		console.log(`[Ada] Response content blocks: ${data.content?.length || 0}`);

		totalInputTokens += data.usage?.input_tokens || 0;
		totalOutputTokens += data.usage?.output_tokens || 0;

		// Process response content
		let responseText = '';
		const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];

		for (const block of data.content) {
			console.log(`[Ada] Block type: ${block.type}`);
			if (block.type === 'text') {
				responseText += block.text;
				console.log(`[Ada] Text block length: ${block.text?.length || 0}`);
			} else if (block.type === 'tool_use') {
				toolUseBlocks.push({
					id: block.id,
					name: block.name,
					input: block.input
				});
				console.log(`[Ada] Tool use: ${block.name}`);
			}
		}

		// Accumulate text content
		finalContent += responseText;
		console.log(`[Ada] Accumulated finalContent length: ${finalContent.length}`);
		console.log(`[Ada] Tool calls this iteration: ${toolUseBlocks.length}`);

		// Only exit if there are NO tool calls - ignore stop_reason when tools were used
		// The model needs to continue after tool results are returned
		if (toolUseBlocks.length === 0) {
			console.log(`[Ada] No tool calls, exiting loop with finalContent length: ${finalContent.length}`);
			break;
		}

		// Execute tools and prepare tool results
		const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

		for (const toolUse of toolUseBlocks) {
			// Track tool call
			allToolCalls.push({
				name: toolUse.name,
				params: toolUse.input
			});

			// Execute the tool
			const result = await executeArchitectTool(
				toolUse.name,
				toolUse.input,
				{}
			);

			// Format result for Anthropic - truncate large results to avoid token limits
			let resultContent = result.formattedResult || JSON.stringify(result.result) || result.error || 'No result';
			const MAX_RESULT_LENGTH = 8000; // ~2000 tokens
			if (resultContent.length > MAX_RESULT_LENGTH) {
				resultContent = resultContent.substring(0, MAX_RESULT_LENGTH) + '\n\n... [Result truncated due to size]';
			}

			toolResults.push({
				type: 'tool_result',
				tool_use_id: toolUse.id,
				content: resultContent
			});
		}

		// Add assistant message with tool use to conversation
		messages.push({
			role: 'assistant',
			content: data.content
		});

		// Add tool results to conversation
		messages.push({
			role: 'user',
			content: toolResults
		});

		console.log(`[Ada] Messages count after tool results: ${messages.length}`);
		console.log(`[Ada] Tool results added: ${toolResults.length}`);

		// Throttle between iterations to avoid rate limits
		console.log('[Ada] Pausing 1s between tool iterations, then continuing loop...');
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	console.log(`[Ada] Loop ended. Final content length: ${finalContent.length}, iterations: ${iterations}`);

	// If we hit the iteration limit and the model was still calling tools,
	// make one final call WITHOUT tools to force a text response
	if (iterations >= MAX_TOOL_ITERATIONS && finalContent.length < 1500) {
		console.log('[Ada] Hit iteration limit, making final call without tools to get response...');

		// Add a message asking for the final response
		messages.push({
			role: 'user',
			content: 'Based on all the information gathered from the files above, please provide your analysis and recommendations now. Do not call any more tools.'
		});

		const finalBody: Record<string, unknown> = {
			model,
			max_tokens: maxTokens,
			system: systemPrompt,
			messages,
			temperature
			// Note: NO tools - force text response
		};

		try {
			const finalResponse = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(finalBody)
			});

			const finalData = await finalResponse.json();
			totalInputTokens += finalData.usage?.input_tokens || 0;
			totalOutputTokens += finalData.usage?.output_tokens || 0;

			for (const block of finalData.content) {
				if (block.type === 'text') {
					finalContent += block.text;
				}
			}
			console.log(`[Ada] Final response added. Total content length: ${finalContent.length}`);
		} catch (error) {
			console.error('[Ada] Error getting final response:', error);
		}
	}

	return {
		content: finalContent,
		toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
		inputTokens: totalInputTokens,
		outputTokens: totalOutputTokens,
		costCents: estimateCost(totalInputTokens, totalOutputTokens, model)
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
