import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/roles';
import { db, aiConfig } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { buildOfficeManagerSystemPrompt } from '$lib/ai/prompts/office-manager';
import { buildRevenueOptimizerSystemPrompt } from '$lib/ai/prompts/revenue-optimizer';
import { buildArchitectSystemPrompt, getArchitectToolsDescription } from '$lib/ai/prompts/architect';
import type { AITone } from '$lib/ai/types';

interface MentatPrompt {
	name: string;
	codename: string;
	description: string;
	model: string;
	provider: string;
	enabled: boolean;
	dryRunMode: boolean;
	tone?: string;
	systemPrompt: string;
	toolsDescription?: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get AI configs for all agents
	const configs = await db.select().from(aiConfig);
	const officeManagerConfig = configs.find(c => c.agent === 'office_manager');
	const revenueOptimizerConfig = configs.find(c => c.agent === 'revenue_optimizer');
	const architectConfig = configs.find(c => c.agent === 'architect');

	// Build the prompts with current configuration
	const mentats: MentatPrompt[] = [
		{
			name: 'Office Manager',
			codename: 'office_manager',
			description: 'Monitors attendance, tasks, and sends helpful reminders. Runs every 15 minutes during business hours.',
			model: officeManagerConfig?.model || 'claude-3-haiku-20240307',
			provider: officeManagerConfig?.provider || 'anthropic',
			enabled: officeManagerConfig?.enabled ?? false,
			dryRunMode: officeManagerConfig?.dryRunMode ?? false,
			tone: officeManagerConfig?.tone || 'helpful_parent',
			systemPrompt: buildOfficeManagerSystemPrompt(
				(officeManagerConfig?.tone || 'helpful_parent') as AITone,
				officeManagerConfig?.instructions || undefined
			)
		},
		{
			name: 'Revenue Optimizer',
			codename: 'revenue_optimizer',
			description: 'Analyzes patterns and writes memories/policies that guide the Office Manager. Runs nightly at 11pm.',
			model: revenueOptimizerConfig?.model || 'claude-3-haiku-20240307',
			provider: revenueOptimizerConfig?.provider || 'anthropic',
			enabled: revenueOptimizerConfig?.enabled ?? false,
			dryRunMode: revenueOptimizerConfig?.dryRunMode ?? false,
			tone: revenueOptimizerConfig?.tone || 'professional',
			systemPrompt: buildRevenueOptimizerSystemPrompt(
				(revenueOptimizerConfig?.tone || 'professional') as AITone,
				revenueOptimizerConfig?.instructions || undefined
			)
		},
		{
			name: 'Ada (Architecture Advisor)',
			codename: 'architect',
			description: 'Interactive advisor for architectural decisions and Claude Code prompt generation.',
			model: architectConfig?.model || 'claude-3-5-sonnet-20241022',
			provider: architectConfig?.provider || 'anthropic',
			enabled: architectConfig?.enabled ?? false,
			dryRunMode: architectConfig?.dryRunMode ?? false,
			systemPrompt: buildArchitectSystemPrompt(architectConfig?.instructions || undefined),
			toolsDescription: getArchitectToolsDescription()
		}
	];

	return {
		mentats
	};
};
