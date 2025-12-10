// Context Assembly - Gathers and formats context from all providers
import type { AIContextProvider, AIAgent, AssembledContext } from '../types';
import { attendanceProvider } from './providers/attendance';
import { tasksProvider } from './providers/tasks';
import { usersProvider } from './providers/users';
import { locationsProvider } from './providers/locations';
import { memoryProvider } from './providers/memory';

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
				console.log(`[AI Context] Skipping ${provider.moduleId} - would exceed token limit`);
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
			console.error(`[AI Context] Error in ${provider.moduleId}:`, error);
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
	const header = `# Current State (as of ${context.timestamp.toLocaleString()})\n\n`;
	const body = context.modules.map(m => m.content).join('\n\n');
	return header + body;
}

export { attendanceProvider, tasksProvider, usersProvider, locationsProvider, memoryProvider };
