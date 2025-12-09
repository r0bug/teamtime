// Architect Chat Messages API - Send messages to Ada
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendMessage } from '$lib/ai/architect';
import { db, aiConfig } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AIConfig } from '$lib/ai/types';

// GET - Not supported, return helpful error
export const GET: RequestHandler = async () => {
	return json({
		success: false,
		error: 'GET method not allowed. Use POST to send messages to Ada.'
	}, { status: 405 });
};

// POST - Send a message to Ada
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const { message, contextModules } = body;

		if (!message || typeof message !== 'string') {
			return json({ success: false, error: 'Message is required' }, { status: 400 });
		}

		// Get architect config
		const [configRow] = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, 'architect'));

		if (!configRow) {
			return json({
				success: false,
				error: 'Architect agent not configured. Please configure it in the Mentats admin.'
			}, { status: 400 });
		}

		if (!configRow.enabled) {
			return json({
				success: false,
				error: 'Architect agent is disabled. Please enable it in the Mentats admin.'
			}, { status: 400 });
		}

		const config: AIConfig = {
			enabled: configRow.enabled,
			dryRunMode: configRow.dryRunMode,
			provider: configRow.provider as 'anthropic' | 'openai',
			model: configRow.model,
			tone: configRow.tone as AIConfig['tone'],
			customInstructions: configRow.customInstructions || undefined,
			apiKey: configRow.apiKey || undefined
		};

		// If in dry run mode, return a placeholder response
		if (config.dryRunMode) {
			return json({
				success: true,
				response: `[DRY RUN MODE] Ada received your message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"

I would analyze this request and provide architectural guidance, potentially creating Claude Code prompts or Architecture Decision Records.

Context modules that would be loaded: ${contextModules?.join(', ') || 'all available'}`,
				toolCalls: [],
				tokensUsed: 0,
				dryRun: true,
				consultation: {
					tier: 'standard',
					reason: 'Dry run mode - no actual consultation',
					triggers: ['dry_run'],
					models: {
						primary: { provider: config.provider, model: config.model }
					},
					costCents: 0,
					tokensUsed: 0
				}
			});
		}

		// Send the message and get response
		const result = await sendMessage(
			params.id,
			message,
			config,
			contextModules
		);

		return json({
			success: true,
			response: result.response,
			toolCalls: result.toolCalls,
			tokensUsed: result.tokensUsed,
			consultation: result.consultation
		});
	} catch (error) {
		console.error('[Architect Messages] Error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
