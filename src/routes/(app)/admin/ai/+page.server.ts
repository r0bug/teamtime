import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, aiConfig, aiActions, aiMemory, aiPolicyNotes, users, aiToolConfig, aiToolKeywords, aiContextConfig, aiContextKeywords } from '$lib/server/db';
import { eq, desc, and, gte } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';
import { getAPIKeys, saveAPIKeys, hasAPIKey, getAvailableProviders } from '$lib/ai/config/keys';
import { MODEL_OPTIONS, TONE_DESCRIPTIONS, DEFAULT_INSTRUCTIONS } from '$lib/ai/config';
import type { AIAgent, AIProvider, AITone } from '$lib/ai/types';
import { createLogger } from '$lib/server/logger';
import { officeManagerTools } from '$lib/ai/tools/office-manager';
import { revenueOptimizerTools } from '$lib/ai/tools/revenue-optimizer';
import { architectTools } from '$lib/ai/architect/tools';
import { aiConfigService } from '$lib/ai/services/config-service';

const log = createLogger('admin:ai');

// Get tool definitions for each agent
const AGENT_TOOLS = {
	office_manager: officeManagerTools.map(t => ({
		name: t.name,
		description: t.description,
		requiresConfirmation: t.requiresConfirmation || false
	})),
	revenue_optimizer: revenueOptimizerTools.map(t => ({
		name: t.name,
		description: t.description,
		requiresConfirmation: t.requiresConfirmation || false
	})),
	architect: architectTools.map(t => ({
		name: t.name,
		description: t.description,
		requiresConfirmation: t.requiresConfirmation || false
	}))
} as const;

// Context providers that can be configured
const CONTEXT_PROVIDERS = [
	{ id: 'user-permissions', name: 'User Permissions', priority: 5 },
	{ id: 'memory', name: 'AI Memory', priority: 10 },
	{ id: 'users', name: 'Staff Roster', priority: 15 },
	{ id: 'attendance', name: 'Attendance', priority: 20 },
	{ id: 'tasks', name: 'Tasks', priority: 25 },
	{ id: 'locations', name: 'Locations', priority: 30 }
];

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get AI configs for both agents
	const configs = await db.select().from(aiConfig);

	// Create default configs if they don't exist
	const officeManagerConfig = configs.find(c => c.agent === 'office_manager');
	const revenueOptimizerConfig = configs.find(c => c.agent === 'revenue_optimizer');

	// Get recent actions (last 24 hours)
	const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const recentActions = await db
		.select({
			id: aiActions.id,
			agent: aiActions.agent,
			toolName: aiActions.toolName,
			reasoning: aiActions.reasoning,
			executed: aiActions.executed,
			blockedReason: aiActions.blockedReason,
			error: aiActions.error,
			costCents: aiActions.costCents,
			createdAt: aiActions.createdAt,
			targetUserId: aiActions.targetUserId
		})
		.from(aiActions)
		.where(gte(aiActions.createdAt, oneDayAgo))
		.orderBy(desc(aiActions.createdAt))
		.limit(20);

	// Get action counts
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayActions = await db
		.select()
		.from(aiActions)
		.where(gte(aiActions.createdAt, todayStart));

	// Get active memories and policies count
	const activeMemories = await db
		.select()
		.from(aiMemory)
		.where(eq(aiMemory.isActive, true));

	const activePolicies = await db
		.select()
		.from(aiPolicyNotes)
		.where(eq(aiPolicyNotes.isActive, true));

	// Get admin users for recipient selection
	const adminUsers = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(eq(users.role, 'admin'));

	// Check which API keys are configured
	const availableProviders = getAvailableProviders();

	// Get tool configurations from database
	const toolConfigs = await db.select().from(aiToolConfig);
	const toolKeywords = await db.select().from(aiToolKeywords).where(eq(aiToolKeywords.isActive, true));
	const contextConfigs = await db.select().from(aiContextConfig);
	const contextKeywords = await db.select().from(aiContextKeywords).where(eq(aiContextKeywords.isActive, true));

	return {
		officeManager: officeManagerConfig || null,
		revenueOptimizer: revenueOptimizerConfig || null,
		recentActions,
		stats: {
			actionsToday: todayActions.length,
			executedToday: todayActions.filter(a => a.executed).length,
			activeMemories: activeMemories.length,
			activePolicies: activePolicies.length,
			totalCostToday: todayActions.reduce((sum, a) => sum + (a.costCents || 0), 0)
		},
		adminUsers,
		availableProviders,
		hasAnthropicKey: hasAPIKey('anthropic'),
		hasOpenAIKey: hasAPIKey('openai'),
		hasSegmindKey: hasAPIKey('segmind'),
		modelOptions: MODEL_OPTIONS,
		toneDescriptions: TONE_DESCRIPTIONS,
		defaultInstructions: DEFAULT_INSTRUCTIONS,
		// Tool control data
		agentTools: AGENT_TOOLS,
		contextProviders: CONTEXT_PROVIDERS,
		toolConfigs,
		toolKeywords,
		contextConfigs,
		contextKeywords
	};
};

export const actions: Actions = {
	// Save API keys
	saveApiKeys: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const anthropicKey = formData.get('anthropicKey') as string;
		const openaiKey = formData.get('openaiKey') as string;
		const segmindKey = formData.get('segmindKey') as string;

		const keys = getAPIKeys();

		// Only update if a new key is provided (not empty)
		if (anthropicKey && anthropicKey.trim()) {
			keys.anthropic = anthropicKey.trim();
		}
		if (openaiKey && openaiKey.trim()) {
			keys.openai = openaiKey.trim();
		}
		if (segmindKey && segmindKey.trim()) {
			keys.segmind = segmindKey.trim();
		}

		const success = saveAPIKeys(keys);
		if (!success) {
			return fail(500, { error: 'Failed to save API keys' });
		}

		return { success: true, message: 'API keys saved' };
	},

	// Save Office Manager config
	saveOfficeManager: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'on';
		const provider = formData.get('provider') as AIProvider;
		const model = formData.get('model') as string;
		const tone = formData.get('tone') as AITone;
		const instructions = formData.get('instructions') as string;
		const dryRunMode = formData.get('dryRunMode') === 'on';
		const sendToAllAdmins = formData.get('sendToAllAdmins') === 'on';
		const temperature = parseFloat(formData.get('temperature') as string) || 0.3;

		// Operational hours
		const operationalStartHour = parseInt(formData.get('operationalStartHour') as string, 10) || 9;
		const operationalEndHour = parseInt(formData.get('operationalEndHour') as string, 10) || 17;
		const operationalDaysRaw = formData.getAll('operationalDays') as string[];
		const operationalDays = operationalDaysRaw.map(d => parseInt(d, 10));
		const runIntervalMinutes = parseInt(formData.get('runIntervalMinutes') as string, 10) || 15;

		try {
			// Check if config exists
			const existing = await db
				.select()
				.from(aiConfig)
				.where(eq(aiConfig.agent, 'office_manager'))
				.limit(1);

			if (existing.length > 0) {
				await db
					.update(aiConfig)
					.set({
						enabled,
						provider,
						model,
						tone,
						instructions: instructions || null,
						dryRunMode,
						sendToAllAdmins,
						temperature: temperature.toString(),
						operationalStartHour,
						operationalEndHour,
						operationalDays,
						runIntervalMinutes,
						updatedAt: new Date()
					})
					.where(eq(aiConfig.agent, 'office_manager'));
			} else {
				await db.insert(aiConfig).values({
					agent: 'office_manager',
					enabled,
					provider,
					model,
					tone,
					instructions: instructions || null,
					dryRunMode,
					sendToAllAdmins,
					temperature: temperature.toString(),
					operationalStartHour,
					operationalEndHour,
					operationalDays,
					runIntervalMinutes
				});
			}

			return { success: true, message: 'Office Manager settings saved' };
		} catch (error) {
			log.error({ error, enabled, provider, model }, 'Error saving Office Manager config');
			return fail(500, { error: 'Failed to save settings' });
		}
	},

	// Save Revenue Optimizer config
	saveRevenueOptimizer: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'on';
		const provider = formData.get('provider') as AIProvider;
		const model = formData.get('model') as string;
		const instructions = formData.get('instructions') as string;
		const dryRunMode = formData.get('dryRunMode') === 'on';
		const sendToAllAdmins = formData.get('sendToAllAdmins') === 'on';

		try {
			const existing = await db
				.select()
				.from(aiConfig)
				.where(eq(aiConfig.agent, 'revenue_optimizer'))
				.limit(1);

			if (existing.length > 0) {
				await db
					.update(aiConfig)
					.set({
						enabled,
						provider,
						model,
						instructions: instructions || null,
						dryRunMode,
						sendToAllAdmins,
						cronSchedule: '0 23 * * *', // Nightly at 11pm
						updatedAt: new Date()
					})
					.where(eq(aiConfig.agent, 'revenue_optimizer'));
			} else {
				await db.insert(aiConfig).values({
					agent: 'revenue_optimizer',
					enabled,
					provider,
					model,
					instructions: instructions || null,
					dryRunMode,
					sendToAllAdmins,
					cronSchedule: '0 23 * * *'
				});
			}

			return { success: true, message: 'Revenue Optimizer settings saved' };
		} catch (error) {
			log.error({ error, enabled, provider, model }, 'Error saving Revenue Optimizer config');
			return fail(500, { error: 'Failed to save settings' });
		}
	},

	// Add a manual policy note
	addPolicy: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const content = formData.get('content') as string;
		const priority = parseInt(formData.get('priority') as string, 10) || 50;

		if (!content || content.trim().length < 5) {
			return fail(400, { error: 'Policy content is required (min 5 characters)' });
		}

		try {
			await db.insert(aiPolicyNotes).values({
				scope: 'global',
				content: content.trim(),
				priority,
				isActive: true,
				createdByUserId: locals.user?.id
			});

			return { success: true, message: 'Policy added' };
		} catch (error) {
			log.error({ error, contentLength: content.trim().length, priority }, 'Error adding policy');
			return fail(500, { error: 'Failed to add policy' });
		}
	},

	// Update tool configuration (enable/disable, confirmation)
	updateToolConfig: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const agent = formData.get('agent') as AIAgent;
		const toolName = formData.get('toolName') as string;
		const isEnabled = formData.get('isEnabled') === 'true';
		const requiresConfirmation = formData.has('requiresConfirmation') ? formData.get('requiresConfirmation') === 'true' : null;

		if (!agent || !toolName) {
			return fail(400, { error: 'Agent and tool name are required' });
		}

		try {
			// Check if config exists
			const existing = await db
				.select()
				.from(aiToolConfig)
				.where(and(eq(aiToolConfig.agent, agent), eq(aiToolConfig.toolName, toolName)))
				.limit(1);

			if (existing.length > 0) {
				await db
					.update(aiToolConfig)
					.set({
						isEnabled,
						requiresConfirmation,
						updatedAt: new Date()
					})
					.where(and(eq(aiToolConfig.agent, agent), eq(aiToolConfig.toolName, toolName)));
			} else {
				await db.insert(aiToolConfig).values({
					agent,
					toolName,
					isEnabled,
					requiresConfirmation
				});
			}

			// Invalidate cache so changes take effect immediately
			aiConfigService.invalidateCache();

			return { success: true, message: `${toolName} configuration updated` };
		} catch (error) {
			log.error({ error, agent, toolName }, 'Error updating tool config');
			return fail(500, { error: 'Failed to update tool configuration' });
		}
	},

	// Add a force keyword for a tool
	addToolKeyword: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const agent = formData.get('agent') as AIAgent;
		const toolName = formData.get('toolName') as string;
		const keyword = formData.get('keyword') as string;

		if (!agent || !toolName || !keyword?.trim()) {
			return fail(400, { error: 'Agent, tool name, and keyword are required' });
		}

		try {
			await db.insert(aiToolKeywords).values({
				agent,
				toolName,
				keyword: keyword.trim().toLowerCase(),
				matchType: 'contains',
				isActive: true
			});

			aiConfigService.invalidateCache();

			return { success: true, message: `Keyword "${keyword}" added to ${toolName}` };
		} catch (error) {
			log.error({ error, agent, toolName, keyword }, 'Error adding tool keyword');
			return fail(500, { error: 'Failed to add keyword' });
		}
	},

	// Remove a force keyword
	removeToolKeyword: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const keywordId = formData.get('keywordId') as string;

		if (!keywordId) {
			return fail(400, { error: 'Keyword ID is required' });
		}

		try {
			await db.delete(aiToolKeywords).where(eq(aiToolKeywords.id, keywordId));
			aiConfigService.invalidateCache();

			return { success: true, message: 'Keyword removed' };
		} catch (error) {
			log.error({ error, keywordId }, 'Error removing tool keyword');
			return fail(500, { error: 'Failed to remove keyword' });
		}
	},

	// Add a context trigger keyword
	addContextKeyword: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const agent = formData.get('agent') as AIAgent;
		const providerId = formData.get('providerId') as string;
		const keyword = formData.get('keyword') as string;

		if (!agent || !providerId || !keyword?.trim()) {
			return fail(400, { error: 'Agent, provider, and keyword are required' });
		}

		try {
			await db.insert(aiContextKeywords).values({
				agent,
				providerId,
				keyword: keyword.trim().toLowerCase(),
				isActive: true
			});

			aiConfigService.invalidateCache();

			return { success: true, message: `Context keyword "${keyword}" added` };
		} catch (error) {
			log.error({ error, agent, providerId, keyword }, 'Error adding context keyword');
			return fail(500, { error: 'Failed to add keyword' });
		}
	},

	// Remove a context keyword
	removeContextKeyword: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const keywordId = formData.get('keywordId') as string;

		if (!keywordId) {
			return fail(400, { error: 'Keyword ID is required' });
		}

		try {
			await db.delete(aiContextKeywords).where(eq(aiContextKeywords.id, keywordId));
			aiConfigService.invalidateCache();

			return { success: true, message: 'Keyword removed' };
		} catch (error) {
			log.error({ error, keywordId }, 'Error removing context keyword');
			return fail(500, { error: 'Failed to remove keyword' });
		}
	},

	// Update context provider configuration
	updateContextConfig: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const agent = formData.get('agent') as AIAgent;
		const providerId = formData.get('providerId') as string;
		const isEnabled = formData.get('isEnabled') === 'true';
		const priorityOverride = formData.has('priorityOverride') ? parseInt(formData.get('priorityOverride') as string, 10) : null;
		const customContext = formData.get('customContext') as string || null;

		if (!agent || !providerId) {
			return fail(400, { error: 'Agent and provider ID are required' });
		}

		try {
			const existing = await db
				.select()
				.from(aiContextConfig)
				.where(and(eq(aiContextConfig.agent, agent), eq(aiContextConfig.providerId, providerId)))
				.limit(1);

			if (existing.length > 0) {
				await db
					.update(aiContextConfig)
					.set({
						isEnabled,
						priorityOverride,
						customContext,
						updatedAt: new Date()
					})
					.where(and(eq(aiContextConfig.agent, agent), eq(aiContextConfig.providerId, providerId)));
			} else {
				await db.insert(aiContextConfig).values({
					agent,
					providerId,
					isEnabled,
					priorityOverride,
					customContext
				});
			}

			aiConfigService.invalidateCache();

			return { success: true, message: 'Context provider configuration updated' };
		} catch (error) {
			log.error({ error, agent, providerId }, 'Error updating context config');
			return fail(500, { error: 'Failed to update context configuration' });
		}
	}
};
