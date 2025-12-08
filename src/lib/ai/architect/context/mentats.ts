// Mentats Context Provider - Shows AI system status
import { db, aiConfig, aiActions } from '$lib/server/db';
import { desc, gte } from 'drizzle-orm';
import type { AIContextProvider } from '../../types';

interface MentatsContext {
	agents: {
		name: string;
		enabled: boolean;
		dryRunMode: boolean;
		provider: string;
		model: string;
		tone?: string;
	}[];
	recentActivity: {
		agent: string;
		actionsLast24h: number;
		executedLast24h: number;
	}[];
}

export const mentatsContextProvider: AIContextProvider<MentatsContext> = {
	moduleId: 'mentats',
	moduleName: 'AI Mentats System',
	description: 'Status of the Office Manager and Revenue Optimizer agents',
	priority: 25,
	agents: ['architect'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<MentatsContext> {
		try {
			// Get agent configurations
			const configs = await db.select().from(aiConfig);

			const agents = configs.map(c => ({
				name: c.agent,
				enabled: c.enabled,
				dryRunMode: c.dryRunMode,
				provider: c.provider,
				model: c.model,
				tone: c.tone
			}));

			// Get recent activity
			const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const recentActions = await db
				.select()
				.from(aiActions)
				.where(gte(aiActions.createdAt, oneDayAgo));

			// Group by agent
			const activityByAgent = new Map<string, { total: number; executed: number }>();
			for (const action of recentActions) {
				const existing = activityByAgent.get(action.agent) || { total: 0, executed: 0 };
				existing.total++;
				if (action.executed) existing.executed++;
				activityByAgent.set(action.agent, existing);
			}

			const recentActivity = [...activityByAgent.entries()].map(([agent, stats]) => ({
				agent,
				actionsLast24h: stats.total,
				executedLast24h: stats.executed
			}));

			return { agents, recentActivity };
		} catch (error) {
			return { agents: [], recentActivity: [] };
		}
	},

	estimateTokens(context: MentatsContext): number {
		const content = this.formatForPrompt(context);
		return Math.ceil(content.length / 4);
	},

	formatForPrompt(context: MentatsContext): string {
		const agentStatus = context.agents.map(a =>
			`- **${a.name}**: ${a.enabled ? 'Enabled' : 'Disabled'}${a.dryRunMode ? ' (Dry Run)' : ''} - ${a.provider}/${a.model}`
		).join('\n');

		const activity = context.recentActivity.map(a =>
			`- ${a.agent}: ${a.actionsLast24h} actions (${a.executedLast24h} executed)`
		).join('\n');

		return `## AI Mentats System Status

### Configured Agents
${agentStatus || '- No agents configured'}

### Recent Activity (Last 24 Hours)
${activity || '- No recent activity'}

### Architecture Notes
The Mentats system consists of:
1. **Office Manager** - Runs on cron, monitors attendance/tasks, sends messages
2. **Revenue Optimizer** - Runs nightly, analyzes patterns, writes memories/policies
3. **Ada (Architect)** - Interactive, produces Claude Code prompts and ADRs (you!)`;
	}
};
