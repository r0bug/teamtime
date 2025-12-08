// Architect (Ada) Admin Page Server
import type { PageServerLoad, Actions } from './$types';
import { db, aiConfig, architectureChats, architectureDecisions } from '$lib/server/db';
import { eq, desc, gte } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	// Get architect config
	const [config] = await db
		.select()
		.from(aiConfig)
		.where(eq(aiConfig.agent, 'architect'));

	// Get recent chat sessions
	const chatSessions = await db
		.select()
		.from(architectureChats)
		.orderBy(desc(architectureChats.updatedAt))
		.limit(10);

	// Get recent decisions
	const recentDecisions = await db
		.select()
		.from(architectureDecisions)
		.orderBy(desc(architectureDecisions.createdAt))
		.limit(5);

	// Stats for dashboard
	const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const stats = {
		totalChats: chatSessions.length,
		totalDecisions: await db.select().from(architectureDecisions).then(rows => rows.length),
		decisionsToday: await db.select().from(architectureDecisions).where(gte(architectureDecisions.createdAt, oneDayAgo)).then(rows => rows.length),
		pendingDecisions: recentDecisions.filter(d => d.status === 'proposed').length
	};

	return {
		config: config ? {
			enabled: config.enabled,
			dryRunMode: config.dryRunMode,
			provider: config.provider,
			model: config.model
		} : null,
		chatSessions: chatSessions.map(c => ({
			id: c.id,
			title: c.title,
			messageCount: (c.messages as unknown[])?.length || 0,
			tokensUsed: c.tokensUsed || 0,
			costCents: c.costCents || 0,
			updatedAt: c.updatedAt.toISOString()
		})),
		recentDecisions: recentDecisions.map(d => ({
			id: d.id,
			title: d.title,
			status: d.status,
			category: d.category,
			createdAt: d.createdAt.toISOString()
		})),
		stats,
		contextModules: ['spec', 'schema', 'codebase', 'mentats']
	};
};

export const actions: Actions = {
	// Create a new chat session
	newChat: async ({ locals }) => {
		const [chat] = await db
			.insert(architectureChats)
			.values({
				messages: [],
				createdByUserId: locals.user?.id
			})
			.returning();

		return { success: true, chatId: chat.id };
	},

	// Configure the architect
	saveConfig: async ({ request }) => {
		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'on';
		const dryRunMode = formData.get('dryRunMode') === 'on';
		const provider = (formData.get('provider') as string) || 'anthropic';
		const model = (formData.get('model') as string) || 'claude-3-5-sonnet-20241022';

		// Check if config exists
		const [existing] = await db
			.select()
			.from(aiConfig)
			.where(eq(aiConfig.agent, 'architect'));

		if (existing) {
			await db
				.update(aiConfig)
				.set({ enabled, dryRunMode, provider, model, updatedAt: new Date() })
				.where(eq(aiConfig.agent, 'architect'));
		} else {
			await db.insert(aiConfig).values({
				agent: 'architect',
				enabled,
				dryRunMode,
				provider,
				model,
				tone: 'professional'
			});
		}

		return { success: true, message: 'Ada configuration saved' };
	}
};
