import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, aiConfig, aiActions, aiMemory, aiPolicyNotes, users } from '$lib/server/db';
import { eq, desc, and, gte } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';
import { getAPIKeys, saveAPIKeys, hasAPIKey, getAvailableProviders } from '$lib/ai/config/keys';
import { MODEL_OPTIONS, TONE_DESCRIPTIONS, DEFAULT_INSTRUCTIONS } from '$lib/ai/config';
import type { AIAgent, AIProvider, AITone } from '$lib/ai/types';

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
		modelOptions: MODEL_OPTIONS,
		toneDescriptions: TONE_DESCRIPTIONS,
		defaultInstructions: DEFAULT_INSTRUCTIONS
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

		const keys = getAPIKeys();

		// Only update if a new key is provided (not empty)
		if (anthropicKey && anthropicKey.trim()) {
			keys.anthropic = anthropicKey.trim();
		}
		if (openaiKey && openaiKey.trim()) {
			keys.openai = openaiKey.trim();
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
					temperature: temperature.toString()
				});
			}

			return { success: true, message: 'Office Manager settings saved' };
		} catch (error) {
			console.error('Error saving Office Manager config:', error);
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
			console.error('Error saving Revenue Optimizer config:', error);
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
		const priority = parseInt(formData.get('priority') as string) || 50;

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
			console.error('Error adding policy:', error);
			return fail(500, { error: 'Failed to add policy' });
		}
	}
};
