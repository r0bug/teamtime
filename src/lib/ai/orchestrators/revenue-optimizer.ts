// Revenue Optimizer Orchestrator - Runs the nightly analysis AI agent
import { db, aiConfig, aiActions, aiCooldowns, aiTokenUsage, timeEntries, aiMemory } from '$lib/server/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from '../providers';
import { assembleContext, formatContextForPrompt } from '../context';
import { buildRevenueOptimizerSystemPrompt, buildRevenueOptimizerUserPrompt } from '../prompts/revenue-optimizer';
import { revenueOptimizerTools } from '../tools/revenue-optimizer';
import type { AIAgent, AIRunResult, AITool, ToolExecutionContext } from '../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:orchestrator:revenue-optimizer');
const AGENT: AIAgent = 'revenue_optimizer';

// Phase 0.4: Maximum write_memory calls per run to prevent memory spam
const MAX_MEMORY_WRITES_PER_RUN = 3;

interface RunConfig {
	forceRun?: boolean;
	maxActions?: number;
	analysisWindow?: string; // e.g., "past 24 hours", "past week"
}

// Transform context summary to match aiActions contextSnapshot schema
function buildContextSnapshot(summary: Record<string, number>): Record<string, number> {
	return {
		clockedIn: summary['attendance_totalClockedIn'] ?? 0,
		expectedButMissing: summary['attendance_totalLateArrivals'] ?? 0,
		overdueTasks: summary['tasks_totalOverdue'] ?? 0,
		pendingApprovals: 0,
		unassignedWithdrawals: 0,
		activeMemories: summary['memory_totalMemories'] ?? 0,
		activePolicies: summary['memory_totalPolicies'] ?? 0,
		totalUsers: summary['users_totalActive'] ?? 0
	};
}

export async function runRevenueOptimizer(config: RunConfig = {}): Promise<AIRunResult> {
	const runId = uuidv4();
	const startedAt = new Date();
	const errors: string[] = [];
	let actionsLogged = 0;
	let actionsExecuted = 0;
	let totalCostCents = 0;
	let contextTokens = 0;

	log.info({ runId }, 'Starting revenue optimizer run');

	try {
		// Get agent configuration
		const agentConfigs = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, AGENT));

		if (agentConfigs.length === 0) {
			log.info({ runId }, 'No configuration found, skipping run');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['No configuration'], totalCostCents);
		}

		const agentConfig = agentConfigs[0];

		if (!agentConfig.enabled && !config.forceRun) {
			log.info({ runId, forceRun: config.forceRun }, 'Agent disabled, skipping run');
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Agent disabled'], totalCostCents);
		}

		const isDryRun = agentConfig.dryRunMode;
		log.info({ runId, mode: isDryRun ? 'DRY_RUN' : 'LIVE', provider: agentConfig.provider, model: agentConfig.model }, 'Run mode configured');

		// Phase 0.4: Data threshold check - only run if there's meaningful new data
		if (!config.forceRun) {
			const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

			// Check for minimum time entries today
			const recentEntriesResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(timeEntries)
				.where(gte(timeEntries.clockIn, oneDayAgo));
			const recentEntries = Number(recentEntriesResult[0]?.count || 0);

			if (recentEntries < 3) {
				log.info({ runId, recentEntries }, 'Skipped: insufficient data for analysis (< 3 time entries)');
				return createResult(runId, startedAt, 0, 0, 0, ['Skipped: insufficient data for analysis'], 0);
			}

			// Check if we already ran successfully in the past 7 days
			const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
			const recentRunsResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(aiActions)
				.where(and(
					eq(aiActions.agent, AGENT),
					gte(aiActions.createdAt, sevenDaysAgo),
					eq(aiActions.executed, true)
				));
			const recentRuns = Number(recentRunsResult[0]?.count || 0);

			if (recentRuns > 0) {
				log.info({ runId, recentRuns }, 'Skipped: already ran successfully within past 7 days');
				return createResult(runId, startedAt, 0, 0, 0, ['Skipped: already ran within 7 days'], 0);
			}
		}

		// Phase 0.4: Reduced context limit from 8000 to 3000 - focus on deltas
		const effectiveMaxTokens = Math.min(agentConfig.maxTokensContext || 8000, 3000);
		const context = await assembleContext(AGENT, effectiveMaxTokens);
		contextTokens = context.totalTokens;
		log.info({ runId, contextTokens, modulesCount: context.modules.length }, 'Context assembled');

		// Get LLM provider
		const provider = getProvider(agentConfig.provider);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tools: AITool<any, any>[] = revenueOptimizerTools;

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
			tools,
			maxTokens: 2048, // More tokens for analysis
			temperature: parseFloat(agentConfig.temperature?.toString() || '0.5') // Slightly higher for creative insights
		});

		log.info({ runId, finishReason: response.finishReason, toolCallsCount: response.toolCalls?.length || 0 }, 'LLM response received');

		// Calculate cost - prefer provider-reported cost if available
		const responseCost = response.usage.costCents ??
			provider.estimateCost(response.usage.inputTokens, response.usage.outputTokens, agentConfig.model);
		log.info({ runId, costCents: responseCost, costType: response.usage.costCents ? 'provider-reported' : 'estimated' }, 'Response cost calculated');

		// Log the analysis action
		await db.insert(aiActions).values({
			agent: AGENT,
			runId,
			runStartedAt: startedAt,
			provider: agentConfig.provider,
			model: agentConfig.model,
			contextSnapshot: buildContextSnapshot(context.summary),
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
			let memoryWriteCount = 0; // Phase 0.4: Track write_memory calls

			for (const toolCall of response.toolCalls.slice(0, maxActions)) {
				// Phase 0.4: Cap write_memory calls to prevent memory spam
				if (toolCall.name === 'write_memory') {
					memoryWriteCount++;
					if (memoryWriteCount > MAX_MEMORY_WRITES_PER_RUN) {
						log.info({ runId, memoryWriteCount }, 'Skipping write_memory: cap reached');
						await db.insert(aiActions).values({
							agent: AGENT,
							runId,
							runStartedAt: startedAt,
							provider: agentConfig.provider,
							model: agentConfig.model,
							toolName: toolCall.name,
							toolParams: toolCall.params,
							executed: false,
							blockedReason: `Memory write cap reached (${MAX_MEMORY_WRITES_PER_RUN} per run)`
						});
						actionsLogged++;
						continue;
					}
				}
				const tool = tools.find(t => t.name === toolCall.name);
				if (!tool) {
					log.warn({ runId, toolName: toolCall.name }, 'Unknown tool requested');
					errors.push(`Unknown tool: ${toolCall.name}`);
					continue;
				}

				// Validate parameters
				const validation = tool.validate(toolCall.params);
				if (!validation.valid) {
					log.warn({ runId, toolName: toolCall.name, error: validation.error }, 'Tool validation failed');

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						provider: agentConfig.provider,
						model: agentConfig.model,
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
					log.info({ runId, toolName: toolCall.name }, 'Tool cooldown active');

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						provider: agentConfig.provider,
						model: agentConfig.model,
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
					log.info({ runId, toolName: toolCall.name, result: resultFormatted }, 'Tool executed successfully');

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						provider: agentConfig.provider,
						model: agentConfig.model,
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
					log.error({ runId, toolName: toolCall.name, error: errorMsg }, 'Tool execution failed');
					errors.push(`${toolCall.name}: ${errorMsg}`);

					await db.insert(aiActions).values({
						agent: AGENT,
						runId,
						runStartedAt: startedAt,
						provider: agentConfig.provider,
						model: agentConfig.model,
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
		const errorStack = error instanceof Error ? error.stack : undefined;
		log.error({ runId, error: errorMsg, stack: errorStack }, 'Run error occurred');
		errors.push(errorMsg);
	}

	// Phase 0.8: Log token usage for dashboard
	const result = createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, errors, totalCostCents);
	try {
		await db.insert(aiTokenUsage).values({
			agent: AGENT,
			runId,
			provider: 'anthropic',
			model: 'unknown',
			inputTokens: 0,
			outputTokens: 0,
			costCents: totalCostCents,
			actionsTaken: actionsExecuted,
			wasSkipped: false,
			durationMs: result.completedAt.getTime() - result.startedAt.getTime()
		});
	} catch (e) {
		log.warn({ error: e instanceof Error ? e.message : 'unknown' }, 'Failed to log token usage');
	}
	return result;
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
