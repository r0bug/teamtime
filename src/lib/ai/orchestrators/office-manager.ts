// Office Manager Orchestrator - Runs the AI agent with multi-step task chaining
import { db, aiConfig, aiActions, aiCooldowns, aiPendingWork, aiTokenUsage, shifts, timeEntries, tasks, users } from '$lib/server/db';
import { eq, and, gte, lt, lte, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from '../providers';
import { assembleContext, formatContextForPrompt } from '../context';
import { getToolsForAgent } from '../tools';
import { buildOfficeManagerSystemPrompt, buildOfficeManagerUserPrompt, buildContinuationPrompt } from '../prompts/office-manager';
import type { AIAgent, AIRunResult, AITool, ToolExecutionContext } from '../types';
import { createLogger } from '$lib/server/logger';
import { getPacificDayBounds } from '$lib/server/utils/timezone';

const log = createLogger('ai:orchestrator:office-manager');
const AGENT: AIAgent = 'office_manager';

// Pre-flight trigger types that determine which context providers to load
export type PreFlightTrigger = 'late_staff' | 'overdue_tasks' | 'forgotten_clockout' | 'pending_work';

interface PreFlightResult {
	shouldRun: boolean;
	triggers: PreFlightTrigger[];
	summary: {
		lateStaffCount: number;
		overdueTaskCount: number;
		forgottenClockoutCount: number;
		hasPendingWork: boolean;
	};
}

interface RunConfig {
	forceRun?: boolean;
	maxActions?: number;
	maxIterations?: number; // Maximum iterations per run (default 3, reduced from 5)
}

// Track completed actions for context in follow-up iterations
interface CompletedAction {
	tool: string;
	result: string;
}

/**
 * Pre-flight triage: check database directly (no LLM call) to determine
 * if there's anything actionable. Returns triggers indicating what needs attention.
 * If nothing is actionable, the Office Manager skips the LLM call entirely.
 */
async function preFlightTriage(): Promise<PreFlightResult> {
	const now = new Date();
	const { start: todayStart, end: todayEnd } = getPacificDayBounds(now);

	// Check 1: Any staff late for shift? (shift started, not clocked in)
	const activeShifts = await db
		.select({ userId: shifts.userId, startTime: shifts.startTime })
		.from(shifts)
		.where(and(
			gte(shifts.startTime, todayStart),
			lte(shifts.startTime, now),
			gte(shifts.endTime, now)
		));

	const clockedInUsers = await db
		.select({ userId: timeEntries.userId })
		.from(timeEntries)
		.where(isNull(timeEntries.clockOut));

	const clockedInSet = new Set(clockedInUsers.map(u => u.userId));
	const lateStaff = activeShifts.filter(s => !clockedInSet.has(s.userId));

	// Check 2: Any overdue tasks?
	const overdueResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(tasks)
		.where(and(
			lt(tasks.dueAt, now),
			eq(tasks.status, 'not_started')
		));
	const overdueTaskCount = Number(overdueResult[0]?.count || 0);

	// Check 3: Any forgotten clock-outs? (clocked in > 16 hours)
	const sixteenHoursAgo = new Date(now.getTime() - 16 * 60 * 60 * 1000);
	const forgottenResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(timeEntries)
		.where(and(
			isNull(timeEntries.clockOut),
			lt(timeEntries.clockIn, sixteenHoursAgo)
		));
	const forgottenClockoutCount = Number(forgottenResult[0]?.count || 0);

	// Check 4: Any pending work from previous runs?
	const pendingWork = await db
		.select({ id: aiPendingWork.id })
		.from(aiPendingWork)
		.where(and(
			eq(aiPendingWork.agent, AGENT),
			eq(aiPendingWork.status, 'pending'),
			gte(aiPendingWork.expiresAt, now)
		))
		.limit(1);
	const hasPendingWork = pendingWork.length > 0;

	// Build triggers list
	const triggers: PreFlightTrigger[] = [];
	if (lateStaff.length > 0) triggers.push('late_staff');
	if (overdueTaskCount > 0) triggers.push('overdue_tasks');
	if (forgottenClockoutCount > 0) triggers.push('forgotten_clockout');
	if (hasPendingWork) triggers.push('pending_work');

	const shouldRun = triggers.length > 0;

	log.info({
		shouldRun,
		triggers,
		lateStaffCount: lateStaff.length,
		overdueTaskCount,
		forgottenClockoutCount,
		hasPendingWork
	}, shouldRun ? 'Pre-flight: actionable items found' : 'Pre-flight: nothing actionable, skipping LLM call');

	return {
		shouldRun,
		triggers,
		summary: {
			lateStaffCount: lateStaff.length,
			overdueTaskCount,
			forgottenClockoutCount,
			hasPendingWork
		}
	};
}

// Transform context summary to match aiActions contextSnapshot schema
function buildContextSnapshot(summary: Record<string, number>): Record<string, number> {
	return {
		clockedIn: summary['attendance_totalClockedIn'] ?? 0,
		expectedButMissing: summary['attendance_totalLateArrivals'] ?? 0,
		overdueTasks: summary['tasks_totalOverdue'] ?? 0,
		pendingApprovals: 0, // Not tracked in current context
		unassignedWithdrawals: 0, // Not tracked in current context
		activeMemories: summary['memory_totalMemories'] ?? 0,
		activePolicies: summary['memory_totalPolicies'] ?? 0,
		totalUsers: summary['users_totalActive'] ?? 0
	};
}

export async function runOfficeManager(config: RunConfig = {}): Promise<AIRunResult> {
	const runId = uuidv4();
	const startedAt = new Date();
	const errors: string[] = [];
	let actionsLogged = 0;
	let actionsExecuted = 0;
	let totalCostCents = 0;
	let contextTokens = 0;

	log.info({ runId }, 'Starting office manager run');

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
				log.info({
					runId,
					currentHour,
					currentDay,
					startHour,
					endHour,
					operationalDays,
					isWithinHours,
					isOperationalDay
				}, 'Outside operational hours, skipping run');
				return createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, ['Outside operational hours'], totalCostCents);
			}
		}

		const isDryRun = agentConfig.dryRunMode;
		log.info({ runId, mode: isDryRun ? 'DRY_RUN' : 'LIVE', provider: agentConfig.provider, model: agentConfig.model }, 'Run mode configured');

		// Phase 0.1: Pre-flight triage - skip LLM if nothing actionable
		if (!config.forceRun) {
			const triage = await preFlightTriage();
			if (!triage.shouldRun) {
				log.info({ runId }, 'Skipped: nothing actionable (pre-flight gating)');
				return createResult(runId, startedAt, 0, 0, 0, ['Skipped: nothing actionable'], 0);
			}
			// Store triggers for context trimming
			(config as RunConfig & { _triggers?: PreFlightTrigger[] })._triggers = triage.triggers;
		}

		// Check for pending work from a previous run
		const pendingWork = await checkAndResumePendingWork();

		// Phase 0.2: Trigger-based context loading - only load relevant providers
		const triggers = (config as RunConfig & { _triggers?: PreFlightTrigger[] })._triggers;
		// Use reduced token limit for routine runs (2000 vs 4000)
		const effectiveMaxTokens = config.forceRun
			? (agentConfig.maxTokensContext || 4000)
			: Math.min(agentConfig.maxTokensContext || 4000, 2000);
		const context = await assembleContext(AGENT, effectiveMaxTokens);
		contextTokens = context.totalTokens;
		log.info({ runId, contextTokens, modulesCount: context.modules.length, triggers }, 'Context assembled');

		// Phase 0.3: Cache context string for reuse across iterations (compute once)
		const cachedContextString = formatContextForPrompt(context);

		// Get LLM provider
		const provider = getProvider(agentConfig.provider);
		const tools = getToolsForAgent(AGENT);

		// Build prompts
		const systemPrompt = buildOfficeManagerSystemPrompt(
			agentConfig.tone,
			agentConfig.instructions || undefined
		);

		// If we have pending work, build a lightweight continuation prompt (Phase 0.3)
		let userPrompt: string;
		if (pendingWork) {
			userPrompt = buildContinuationPrompt(
				cachedContextString,
				pendingWork.completedActions as CompletedAction[],
				pendingWork.remainingTasks as string[],
				pendingWork.reason
			);
			log.info({
				runId,
				pendingWorkId: pendingWork.id,
				remainingTasks: pendingWork.remainingTasks,
				iteration: pendingWork.iterationCount
			}, 'Resuming pending work');
		} else {
			userPrompt = buildOfficeManagerUserPrompt(cachedContextString);
		}

		// Task chaining loop - reduced from 5 to 3 iterations
		const maxIterations = config.maxIterations || 3;
		let iteration = pendingWork?.iterationCount || 1;
		let completedActions: CompletedAction[] = (pendingWork?.completedActions as CompletedAction[]) || [];
		let shouldContinue = true;
		let currentPendingWorkId = pendingWork?.id;

		while (shouldContinue && iteration <= maxIterations) {
			log.info({ runId, iteration, maxIterations }, 'Starting iteration');

			// Make LLM request
			const response = await provider.complete({
				model: agentConfig.model,
				systemPrompt,
				userPrompt,
				tools,
				maxTokens: 1024,
				temperature: parseFloat(agentConfig.temperature?.toString() || '0.3')
			});

			log.info({ runId, iteration, finishReason: response.finishReason, toolCallsCount: response.toolCalls?.length || 0 }, 'LLM response received');

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
				contextSnapshot: iteration === 1 ? buildContextSnapshot(context.summary) : null,
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

					// Check cooldowns (skip for continue_work)
					if (toolCall.name !== 'continue_work') {
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

			// Handle continuation
			if (shouldContinue) {
				iteration++;

				if (iteration <= maxIterations) {
					// Phase 0.3: Reuse cached context string instead of re-assembling
					userPrompt = buildContinuationPrompt(
						cachedContextString,
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
					log.info({ runId, iteration, remainingTasks }, 'Hit iteration limit, saving pending work for continuation');

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

	// Phase 0.8: Log token usage for dashboard
	const result = createResult(runId, startedAt, contextTokens, actionsLogged, actionsExecuted, errors, totalCostCents);
	try {
		await db.insert(aiTokenUsage).values({
			agent: AGENT,
			runId,
			provider: 'anthropic', // Default, overridden if config available
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
