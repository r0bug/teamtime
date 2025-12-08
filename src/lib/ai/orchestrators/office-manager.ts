// Office Manager Orchestrator - Runs the AI agent
import { db, aiConfig, aiActions, aiCooldowns } from '$lib/server/db';
import { eq, and, gte, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from '../providers';
import { assembleContext, formatContextForPrompt } from '../context';
import { getToolsForAgent } from '../tools';
import { buildOfficeManagerSystemPrompt, buildOfficeManagerUserPrompt } from '../prompts/office-manager';
import type { AIAgent, AIRunResult, AITool, ToolExecutionContext } from '../types';

const AGENT: AIAgent = 'office_manager';

interface RunConfig {
	forceRun?: boolean;
	maxActions?: number;
}

export async function runOfficeManager(config: RunConfig = {}): Promise<AIRunResult> {
	const runId = uuidv4();
	const startedAt = new Date();
	const errors: string[] = [];
	let actionsLogged = 0;
	let actionsExecuted = 0;
	let totalCostCents = 0;
	let contextTokens = 0;

	console.log(`[Office Manager] Starting run ${runId}`);

	try {
		// Get agent configuration
		const agentConfigs = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, AGENT));

		if (agentConfigs.length === 0) {
			console.log('[Office Manager] No configuration found - skipping');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['No configuration'], totalCostCents);
		}

		const agentConfig = agentConfigs[0];

		if (!agentConfig.enabled && !config.forceRun) {
			console.log('[Office Manager] Agent disabled - skipping');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Agent disabled'], totalCostCents);
		}

		const isDryRun = agentConfig.dryRunMode;
		console.log(`[Office Manager] Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

		// Assemble context
		const context = await assembleContext(AGENT, agentConfig.maxTokensContext);
		contextTokens = context.totalTokens;
		console.log(`[Office Manager] Context assembled: ${contextTokens} tokens, ${context.modules.length} modules`);

		// Get LLM provider
		const provider = getProvider(agentConfig.provider);
		const tools = getToolsForAgent(AGENT);

		// Build prompts
		const systemPrompt = buildOfficeManagerSystemPrompt(
			agentConfig.tone,
			agentConfig.instructions || undefined
		);
		const userPrompt = buildOfficeManagerUserPrompt(formatContextForPrompt(context));

		// Make LLM request
		const response = await provider.complete({
			model: agentConfig.model,
			systemPrompt,
			userPrompt,
			tools,
			maxTokens: 1024,
			temperature: parseFloat(agentConfig.temperature?.toString() || '0.3')
		});

		console.log(`[Office Manager] LLM response: ${response.finishReason}, ${response.toolCalls?.length || 0} tool calls`);

		// Log the observation action
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
			costCents: provider.estimateCost(response.usage.inputTokens, response.usage.outputTokens, agentConfig.model)
		});
		actionsLogged++;
		totalCostCents += provider.estimateCost(response.usage.inputTokens, response.usage.outputTokens, agentConfig.model);

		// Execute tool calls
		if (response.toolCalls && response.toolCalls.length > 0) {
			const maxActions = config.maxActions || 3;

			for (const toolCall of response.toolCalls.slice(0, maxActions)) {
				const tool = tools.find(t => t.name === toolCall.name);
				if (!tool) {
					console.log(`[Office Manager] Unknown tool: ${toolCall.name}`);
					errors.push(`Unknown tool: ${toolCall.name}`);
					continue;
				}

				// Validate parameters
				const validation = tool.validate(toolCall.params);
				if (!validation.valid) {
					console.log(`[Office Manager] Validation failed for ${toolCall.name}: ${validation.error}`);

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
					console.log(`[Office Manager] Cooldown active for ${toolCall.name}`);

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
					console.log(`[Office Manager] ${toolCall.name}: ${resultFormatted}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						toolName: toolCall.name,
						toolParams: toolCall.params,
						executed: !isDryRun,
						executionResult: result as Record<string, unknown>,
						targetUserId: (toolCall.params as { toUserId?: string }).toUserId ||
							(toolCall.params as { assignToUserId?: string }).assignToUserId
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
					console.error(`[Office Manager] Tool execution error:`, error);
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
		console.error('[Office Manager] Run error:', error);
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

async function checkCooldown(tool: AITool, params: Record<string, unknown>): Promise<boolean> {
	if (!tool.cooldown) return false;

	const now = new Date();

	// Check per-user cooldown
	if (tool.cooldown.perUser) {
		const userId = (params as { toUserId?: string; assignToUserId?: string }).toUserId ||
			(params as { assignToUserId?: string }).assignToUserId;

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

async function setCooldown(tool: AITool, params: Record<string, unknown>, runId: string): Promise<void> {
	const now = new Date();

	// Set per-user cooldown
	if (tool.cooldown?.perUser) {
		const userId = (params as { toUserId?: string; assignToUserId?: string }).toUserId ||
			(params as { assignToUserId?: string }).assignToUserId;

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
