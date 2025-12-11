// Context Assembly - Gathers and formats context from all providers
import type { AIContextProvider, AIAgent, AssembledContext } from '../types';
import { attendanceProvider } from './providers/attendance';
import { tasksProvider } from './providers/tasks';
import { usersProvider } from './providers/users';
import { locationsProvider } from './providers/locations';
import { memoryProvider } from './providers/memory';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:context');

// Registry of all context providers
const providers: AIContextProvider[] = [
	memoryProvider,
	attendanceProvider,
	tasksProvider,
	usersProvider,
	locationsProvider
];

export async function assembleContext(
	agent: AIAgent,
	maxTokens: number = 4000
): Promise<AssembledContext> {
	const timestamp = new Date();
	const modules: AssembledContext['modules'] = [];
	const summary: Record<string, number> = {};
	let totalTokens = 0;

	// Filter providers for this agent and sort by priority
	const agentProviders = providers
		.filter(p => p.agents.includes(agent))
		.sort((a, b) => a.priority - b.priority);

	for (const provider of agentProviders) {
		try {
			const enabled = await provider.isEnabled();
			if (!enabled) continue;

			const context = await provider.getContext();
			const tokenEstimate = provider.estimateTokens(context);

			// Check if we have room
			if (totalTokens + tokenEstimate > maxTokens) {
				log.info('Skipping context module - would exceed token limit', { moduleId: provider.moduleId, tokenEstimate, currentTotal: totalTokens, maxTokens });
				continue;
			}

			const content = provider.formatForPrompt(context);
			modules.push({
				moduleId: provider.moduleId,
				moduleName: provider.moduleName,
				content,
				tokenEstimate
			});

			totalTokens += tokenEstimate;

			// Add summary stats if available
			if (typeof context === 'object' && context !== null && 'summary' in context) {
				const ctxSummary = (context as { summary: Record<string, number> }).summary;
				for (const [key, value] of Object.entries(ctxSummary)) {
					summary[`${provider.moduleId}_${key}`] = value;
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			log.error('Error loading context module', { moduleId: provider.moduleId, error: errorMsg });
		}
	}

	return {
		timestamp,
		agent,
		modules,
		totalTokens,
		summary
	};
}

export function formatContextForPrompt(context: AssembledContext): string {
	const now = context.timestamp;
	const today = now.toISOString().split('T')[0];

	// Calculate end of week (Sunday)
	const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
	const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
	const endOfWeek = new Date(now);
	endOfWeek.setDate(now.getDate() + daysUntilSunday);
	const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

	// Calculate end of next week
	const endOfNextWeek = new Date(endOfWeek);
	endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
	const endOfNextWeekStr = endOfNextWeek.toISOString().split('T')[0];

	const header = `# Current State (as of ${now.toLocaleString()})

## IMPORTANT: Date Reference (use these exact dates for tools)
- **Today's date**: ${today} (${now.toLocaleDateString('en-US', { weekday: 'long' })})
- **End of this week (Sunday)**: ${endOfWeekStr}
- **End of next week**: ${endOfNextWeekStr}
- For "rest of the week" schedules, use date="${today}" and endDate="${endOfWeekStr}"

`;
	const body = context.modules.map(m => m.content).join('\n\n');
	return header + body;
}

export { attendanceProvider, tasksProvider, usersProvider, locationsProvider, memoryProvider };
