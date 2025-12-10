// Revenue Optimizer Orchestrator - Runs the nightly analysis AI agent
import { db, aiConfig, aiActions, aiCooldowns } from '$lib/server/db';
import { eq, and, gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from '../providers';
import { assembleContext, formatContextForPrompt } from '../context';
import { buildRevenueOptimizerSystemPrompt, buildRevenueOptimizerUserPrompt } from '../prompts/revenue-optimizer';
import { revenueOptimizerTools } from '../tools/revenue-optimizer';
import type { AIAgent, AIRunResult, AITool, ToolExecutionContext } from '../types';

const AGENT: AIAgent = 'revenue_optimizer';

interface RunConfig {
	forceRun?: boolean;
	maxActions?: number;
	analysisWindow?: string; // e.g., "past 24 hours", "past week"
}

export async function runRevenueOptimizer(config: RunConfig = {}): Promise<AIRunResult> {
	const runId = uuidv4();
	const startedAt = new Date();
	const errors: string[] = [];
	let actionsLogged = 0;
	let actionsExecuted = 0;
	let totalCostCents = 0;
	let contextTokens = 0;

	console.log(`[Revenue Optimizer] Starting run ${runId}`);

	try {
		// Get agent configuration
		const agentConfigs = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, AGENT));

		if (agentConfigs.length === 0) {
			console.log('[Revenue Optimizer] No configuration found - skipping');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['No configuration'], totalCostCents);
		}

		const agentConfig = agentConfigs[0];

		if (!agentConfig.enabled && !config.forceRun) {
			console.log('[Revenue Optimizer] Agent disabled - skipping');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Agent disabled'], totalCostCents);
		}

		const isDryRun = agentConfig.dryRunMode;
		console.log(`[Revenue Optimizer] Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
		console.log(`[Revenue Optimizer] Provider: ${agentConfig.provider}, Model: ${agentConfig.model}`);

		// Assemble context - Revenue Optimizer needs more context for analysis
		const context = await assembleContext(AGENT, agentConfig.maxTokensContext || 8000);
		contextTokens = context.totalTokens;
		console.log(`[Revenue Optimizer] Context assembled: ${contextTokens} tokens, ${context.modules.length} modules`);

		// Get LLM provider
		const provider = getProvider(agentConfig.provider);
		const tools = revenueOptimizerTools;

		// Build prompts
		const systemPrompt = buildRevenueOptimizerSystemPrompt(
			agentConfig.tone,
			agentConfig.instructions || undefined
		);
		const userPrompt = buildRevenueOptimizerUserPrompt(
			formatContextForPrompt(context),
			config.analysisWindow || 'past 24 hours'
		);

		// Make LLM request - Revenue Optimizer can use more tokens for analysis
		const response = await provider.complete({
			model: agentConfig.model,
			systemPrompt,
			userPrompt,
			tools: tools.map(t => ({
				name: t.name,
				description: t.description,
				parameters: t.parameters
			})),
			maxTokens: 2048, // More tokens for analysis
			temperature: parseFloat(agentConfig.temperature?.toString() || '0.5') // Slightly higher for creative insights
		});

		console.log(`[Revenue Optimizer] LLM response: ${response.finishReason}, ${response.toolCalls?.length || 0} tool calls`);

		// Calculate cost - prefer provider-reported cost if available
		const responseCost = response.usage.costCents ??
			provider.estimateCost(response.usage.inputTokens, response.usage.outputTokens, agentConfig.model);
		console.log(`[Revenue Optimizer] Cost: ${responseCost} cents (${response.usage.costCents ? 'provider-reported' : 'estimated'})`);

		// Log the analysis action
		await db.insert(aiActions).values({
			agent: AGENT,
			runId,
			runStartedAt: startedAt,
			contextSnapshot: context.summary,
			contextTokens,
			reasoning: response.content,
			toolName: null,
			executed: false,
			tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
			costCents: responseCost
		});
		actionsLogged++;
		totalCostCents += responseCost;

		// Execute tool calls - Revenue Optimizer can take more actions
		if (response.toolCalls && response.toolCalls.length > 0) {
			const maxActions = config.maxActions || 10; // Higher limit for batch analysis

			for (const toolCall of response.toolCalls.slice(0, maxActions)) {
				const tool = tools.find(t => t.name === toolCall.name);
				if (!tool) {
					console.log(`[Revenue Optimizer] Unknown tool: ${toolCall.name}`);
					errors.push(`Unknown tool: ${toolCall.name}`);
					continue;
				}

				// Validate parameters
				const validation = tool.validate(toolCall.params);
				if (!validation.valid) {
					console.log(`[Revenue Optimizer] Validation failed for ${toolCall.name}: ${validation.error}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: false,
						blockedReason: `Validation failed: ${validation.error}`
					});
					actionsLogged++;
					continue;
				}

				// Check cooldowns
				const cooldownBlocked = await checkCooldown(tool, toolCall.params);
				if (cooldownBlocked) {
					console.log(`[Revenue Optimizer] Cooldown active for ${toolCall.name}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: false,
						blockedReason: 'Cooldown active'
					});
					actionsLogged++;
					continue;
				}

				// Execute the tool
				const execContext: ToolExecutionContext = {
					runId,
					agent: AGENT,
					dryRun: isDryRun,
					config: {
						provider: agentConfig.provider,
						model: agentConfig.model
					}
				};

				try {
					const result = await tool.execute(toolCall.params, execContext);
					const resultFormatted = tool.formatResult(result);
					console.log(`[Revenue Optimizer] ${toolCall.name}: ${resultFormatted}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: !isDryRun,
						executionResult: result as Record<string, unknown>,
						targetUserId: (toolCall.params as { userId?: string }).userId
					});
					actionsLogged++;

					if (!isDryRun) {
						actionsExecuted++;

						// Set cooldown
						if (tool.cooldown) {
							await setCooldown(tool, toolCall.params, runId);
						}
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'Unknown error';
					console.error(`[Revenue Optimizer] Tool execution error:`, error);
					errors.push(`${toolCall.name}: ${errorMsg}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: false,
						error: errorMsg
					});
					actionsLogged++;
				}
			}
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[Revenue Optimizer] Run error:', error);
		errors.push(errorMsg);
	}

	return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, errors, totalCostCents);
}

function createResult(
	runId: string,
	startedAt: Date,
	contextTokens: number,
	actionsLogged: number,
	actionsExecuted: number,
	errors: string[],
	totalCostCents: number
): AIRunResult {
	return {
		runId,
		agent: AGENT,
		startedAt,
		completedAt: new Date(),
		contextTokens,
		actionsLogged,
		actionsExecuted,
		errors,
		totalCostCents
	};
}

async function checkCooldown(tool: AITool<unknown, unknown>, params: Record<string, unknown>): Promise<boolean> {
	if (!tool.cooldown) return false;

	const now = new Date();

	// Check per-user cooldown
	if (tool.cooldown.perUser) {
		const userId = (params as { userId?: string }).userId;

		if (userId) {
			const existing = await db
				.select()
				.from(aiCooldowns)
				.where(and(
					eq(aiCooldowns.agent, AGENT),
					eq(aiCooldowns.userId, userId),
					eq(aiCooldowns.actionType, tool.name),
					gte(aiCooldowns.expiresAt, now)
				))
				.limit(1);

			if (existing.length > 0) return true;
		}
	}

	// Check global cooldown
	if (tool.cooldown.global) {
		const existing = await db
			.select()
			.from(aiCooldowns)
			.where(and(
				eq(aiCooldowns.agent, AGENT),
				eq(aiCooldowns.actionType, `${tool.name}_global`),
				gte(aiCooldowns.expiresAt, now)
			))
			.limit(1);

		if (existing.length > 0) return true;
	}

	return false;
}

async function setCooldown(tool: AITool<unknown, unknown>, params: Record<string, unknown>, runId: string): Promise<void> {
	const now = new Date();

	// Set per-user cooldown
	if (tool.cooldown?.perUser) {
		const userId = (params as { userId?: string }).userId;

		if (userId) {
			const expiresAt = new Date(now.getTime() + tool.cooldown.perUser * 60 * 1000);
			await db.insert(aiCooldowns).values({
				agent: AGENT,
				userId,
				actionType: tool.name,
				expiresAt,
				reason: 'Per-user cooldown'
			});
		}
	}

	// Set global cooldown
	if (tool.cooldown?.global) {
		const expiresAt = new Date(now.getTime() + tool.cooldown.global * 60 * 1000);
		await db.insert(aiCooldowns).values({
			agent: AGENT,
			actionType: `${tool.name}_global`,
			expiresAt,
			reason: 'Global cooldown'
		});
	}
}
