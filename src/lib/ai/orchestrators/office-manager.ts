// Office Manager Orchestrator - Runs the AI agent with multi-step task chaining
import { db, aiConfig, aiActions, aiCooldowns, aiPendingWork } from '$lib/server/db';
import { eq, and, gte, lt, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from '../providers';
import { assembleContext, formatContextForPrompt } from '../context';
import { getToolsForAgent } from '../tools';
import { buildOfficeManagerSystemPrompt, buildOfficeManagerUserPrompt, buildContinuationPrompt } from '../prompts/office-manager';
import type { AIAgent, AIRunResult, AITool, ToolExecutionContext } from '../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:orchestrator:office-manager');
const AGENT: AIAgent = 'office_manager';

interface RunConfig {
	forceRun?: boolean;
	maxActions?: number;
	maxIterations?: number; // Maximum iterations per run (default 5)
}

// Track completed actions for context in follow-up iterations
interface CompletedAction {
	tool: string;
	result: string;
}

export async function runOfficeManager(config: RunConfig = {}): Promise<AIRunResult> {
	const runId = uuidv4();
	const startedAt = new Date();
	const errors: string[] = [];
	let actionsLogged = 0;
	let actionsExecuted = 0;
	let totalCostCents = 0;
	let contextTokens = 0;

	log.info('Starting office manager run', { runId });

	try {
		// Get agent configuration
		const agentConfigs = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, AGENT));

		if (agentConfigs.length === 0) {
			log.info('No configuration found, skipping run', { runId });
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['No configuration'], totalCostCents);
		}

		const agentConfig = agentConfigs[0];

		if (!agentConfig.enabled && !config.forceRun) {
			log.info('Agent disabled, skipping run', { runId, forceRun: config.forceRun });
			return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Agent disabled'], totalCostCents);
		}

		// Check operational hours (unless force run)
		if (!config.forceRun) {
			const now = new Date();
			const currentHour = now.getHours();
			const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

			const startHour = agentConfig.operationalStartHour ?? 9;
			const endHour = agentConfig.operationalEndHour ?? 17;
			const operationalDays = (agentConfig.operationalDays as number[]) ?? [1, 2, 3, 4, 5];

			const isWithinHours = currentHour >= startHour && currentHour < endHour;
			const isOperationalDay = operationalDays.includes(currentDay);

			if (!isWithinHours || !isOperationalDay) {
				log.info('Outside operational hours, skipping run', {
					runId,
					currentHour,
					currentDay,
					startHour,
					endHour,
					operationalDays,
					isWithinHours,
					isOperationalDay
				});
				return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Outside operational hours'], totalCostCents);
			}
		}

		const isDryRun = agentConfig.dryRunMode;
		log.info('Run mode configured', { runId, mode: isDryRun ? 'DRY_RUN' : 'LIVE', provider: agentConfig.provider, model: agentConfig.model });

		// Check for pending work from a previous run
		const pendingWork = await checkAndResumePendingWork();

		// Assemble context
		const context = await assembleContext(AGENT, agentConfig.maxTokensContext);
		contextTokens = context.totalTokens;
		log.info('Context assembled', { runId, contextTokens, modulesCount: context.modules.length });

		// Get LLM provider
		const provider = getProvider(agentConfig.provider);
		const tools = getToolsForAgent(AGENT);

		// Build prompts
		const systemPrompt = buildOfficeManagerSystemPrompt(
			agentConfig.tone,
			agentConfig.instructions || undefined
		);

		// If we have pending work, build a continuation prompt instead
		let userPrompt: string;
		if (pendingWork) {
			userPrompt = buildContinuationPrompt(
				formatContextForPrompt(context),
				pendingWork.completedActions as CompletedAction[],
				pendingWork.remainingTasks as string[],
				pendingWork.reason
			);
			log.info('Resuming pending work', {
				runId,
				pendingWorkId: pendingWork.id,
				remainingTasks: pendingWork.remainingTasks,
				iteration: pendingWork.iterationCount
			});
		} else {
			userPrompt = buildOfficeManagerUserPrompt(formatContextForPrompt(context));
		}

		// Task chaining loop
		const maxIterations = config.maxIterations || 5;
		let iteration = pendingWork?.iterationCount || 1;
		let completedActions: CompletedAction[] = (pendingWork?.completedActions as CompletedAction[]) || [];
		let shouldContinue = true;
		let currentPendingWorkId = pendingWork?.id;

		while (shouldContinue && iteration <= maxIterations) {
			log.info('Starting iteration', { runId, iteration, maxIterations });

			// Make LLM request
			const response = await provider.complete({
				model: agentConfig.model,
				systemPrompt,
				userPrompt,
				tools,
				maxTokens: 1024,
				temperature: parseFloat(agentConfig.temperature?.toString() || '0.3')
			});

			log.info('LLM response received', { runId, iteration, finishReason: response.finishReason, toolCallsCount: response.toolCalls?.length || 0 });

			// Calculate cost
			const responseCost = response.usage.costCents ??
				provider.estimateCost(response.usage.inputTokens, response.usage.outputTokens, agentConfig.model);
			totalCostCents += responseCost;

			// Log the observation action
			await db.insert(aiActions).values({
				agent: AGENT,
				runId,
				runStartedAt: startedAt,
				provider: agentConfig.provider,
				model: agentConfig.model,
				contextSnapshot: iteration === 1 ? context.summary : `Iteration ${iteration}`,
				contextTokens: iteration === 1 ? contextTokens : 0,
				reasoning: response.content,
				toolName: null,
				executed: false,
				tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
				costCents: responseCost
			});
			actionsLogged++;

			// Process tool calls
			shouldContinue = false;
			let continueReason = '';
			let remainingTasks: string[] = [];

			if (response.toolCalls && response.toolCalls.length > 0) {
				const maxActions = config.maxActions || 3;

				for (const toolCall of response.toolCalls.slice(0, maxActions)) {
					const tool = tools.find(t => t.name === toolCall.name);
					if (!tool) {
						log.warn('Unknown tool requested', { runId, toolName: toolCall.name });
						errors.push(`Unknown tool: ${toolCall.name}`);
						continue;
					}

					// Validate parameters
					const validation = tool.validate(toolCall.params);
					if (!validation.valid) {
						log.warn('Tool validation failed', { runId, toolName: toolCall.name, error: validation.error });

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

					// Check cooldowns (skip for continue_work)
					if (toolCall.name !== 'continue_work') {
						const cooldownBlocked = await checkCooldown(tool, toolCall.params);
						if (cooldownBlocked) {
							log.info('Tool cooldown active', { runId, toolName: toolCall.name });

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
						log.info('Tool executed successfully', { runId, toolName: toolCall.name, result: resultFormatted });

						// Check if this is a continue_work signal
						if (toolCall.name === 'continue_work') {
							const continueResult = result as { shouldContinue: boolean; remainingTasks: string[] };
							if (continueResult.shouldContinue && continueResult.remainingTasks.length > 0) {
								shouldContinue = true;
								continueReason = (toolCall.params as { reason: string }).reason;
								remainingTasks = continueResult.remainingTasks;
							}
						} else {
							// Track completed action for context
							completedActions.push({
								tool: toolCall.name,
								result: resultFormatted
							});
						}

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
							targetUserId: (toolCall.params as { toUserId?: string }).toUserId ||
								(toolCall.params as { assignToUserId?: string }).assignToUserId
						});
						actionsLogged++;

						if (!isDryRun && toolCall.name !== 'continue_work') {
							actionsExecuted++;

							// Set cooldown
							if (tool.cooldown) {
								await setCooldown(tool, toolCall.params, runId);
							}
						}
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : 'Unknown error';
						log.error('Tool execution failed', { runId, toolName: toolCall.name, error: errorMsg });
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

			// Handle continuation
			if (shouldContinue) {
				iteration++;

				if (iteration <= maxIterations) {
					// Build continuation prompt for next iteration
					userPrompt = buildContinuationPrompt(
						formatContextForPrompt(context),
						completedActions,
						remainingTasks,
						continueReason
					);

					// Update or create pending work record
					if (currentPendingWorkId) {
						await db.update(aiPendingWork)
							.set({
								completedActions,
								remainingTasks,
								reason: continueReason,
								iterationCount: iteration,
								updatedAt: new Date()
							})
							.where(eq(aiPendingWork.id, currentPendingWorkId));
					}
				} else {
					// Hit iteration limit - save pending work for next cron run
					log.info('Hit iteration limit, saving pending work for continuation', { runId, iteration, remainingTasks });

					const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // Expire in 1 hour

					if (currentPendingWorkId) {
						await db.update(aiPendingWork)
							.set({
								completedActions,
								remainingTasks,
								reason: continueReason,
								iterationCount: iteration,
								status: 'pending',
								expiresAt,
								updatedAt: new Date()
							})
							.where(eq(aiPendingWork.id, currentPendingWorkId));
					} else {
						await db.insert(aiPendingWork).values({
							agent: AGENT,
							runId,
							completedActions,
							remainingTasks,
							reason: continueReason,
							iterationCount: iteration,
							maxIterations: maxIterations + 5, // Allow more iterations on resume
							expiresAt
						});
					}

					errors.push(`Iteration limit reached (${maxIterations}), ${remainingTasks.length} tasks pending for next run`);
				}
			} else {
				// Work complete - clear any pending work
				if (currentPendingWorkId) {
					await db.update(aiPendingWork)
						.set({ status: 'completed', updatedAt: new Date() })
						.where(eq(aiPendingWork.id, currentPendingWorkId));
				}
			}
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;
		log.error({ runId, error: errorMsg, stack: errorStack }, 'Run error occurred');
		errors.push(errorMsg);
	}

	return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, errors, totalCostCents);
}

// Check for and resume any pending work from previous runs
async function checkAndResumePendingWork() {
	const now = new Date();

	// Find pending work that hasn't expired
	const pending = await db
		.select()
		.from(aiPendingWork)
		.where(and(
			eq(aiPendingWork.agent, AGENT),
			eq(aiPendingWork.status, 'pending'),
			gte(aiPendingWork.expiresAt, now)
		))
		.orderBy(aiPendingWork.createdAt)
		.limit(1);

	if (pending.length > 0) {
		// Mark as in_progress
		await db.update(aiPendingWork)
			.set({ status: 'in_progress', updatedAt: now })
			.where(eq(aiPendingWork.id, pending[0].id));

		return pending[0];
	}

	// Also expire any old pending work
	await db.update(aiPendingWork)
		.set({ status: 'expired', updatedAt: now })
		.where(and(
			eq(aiPendingWork.status, 'pending'),
			lt(aiPendingWork.expiresAt, now)
		));

	return null;
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
