// Context Assembly - Gathers and formats context from all providers
import type { AIContextProvider, AIAgent, AssembledContext } from '../types';
import { attendanceProvider } from './providers/attendance';
import { tasksProvider } from './providers/tasks';
import { usersProvider } from './providers/users';
import { locationsProvider } from './providers/locations';
import { memoryProvider } from './providers/memory';
import { userPermissionsProvider, setCurrentUserId, getCurrentUserId } from './providers/user-permissions';
import { aiConfigService } from '../services/config-service';
import { createLogger } from '$lib/server/logger';
import { getPacificDateParts, getPacificWeekday, toPacificDateString, toPacificDateTimeString } from '$lib/server/utils/timezone';

const log = createLogger('ai:context');

// Registry of all context providers with their default priorities
const providers: AIContextProvider[] = [
	userPermissionsProvider, // First - permissions context (priority 5)
	memoryProvider,          // Priority 10
	attendanceProvider,      // Priority 20
	tasksProvider,           // Priority 25
	usersProvider,           // Priority 15
	locationsProvider        // Priority 30
];

// Map provider moduleId to the provider for easy lookup
const providerMap = new Map(providers.map(p => [p.moduleId, p]));

// Re-export for use by orchestrator and other providers
export { setCurrentUserId, getCurrentUserId };

export async function assembleContext(
	agent: AIAgent,
	maxTokens: number = 4000
): Promise<AssembledContext> {
	const timestamp = new Date();
	const modules: AssembledContext['modules'] = [];
	const summary: Record<string, number> = {};
	let totalTokens = 0;

	// Get database-configured context provider settings
	const providerDefaults = providers
		.filter(p => p.agents.includes(agent))
		.map(p => ({
			providerId: p.moduleId,
			priority: p.priority,
			moduleName: p.moduleName
		}));

	const configuredProviders = await aiConfigService.getAllContextConfigs(agent, providerDefaults);

	// Build list of providers with their effective priorities
	const agentProviders: Array<{ provider: AIContextProvider; config: typeof configuredProviders[0] }> = [];
	for (const config of configuredProviders) {
		const provider = providerMap.get(config.providerId);
		if (provider && provider.agents.includes(agent)) {
			agentProviders.push({ provider, config });
		}
	}

	// Sort by effective priority (config override or default)
	agentProviders.sort((a, b) => a.config.priority - b.config.priority);

	for (const { provider, config } of agentProviders) {
		try {
			// Check if provider is enabled (DB config overrides)
			if (!config.isEnabled) {
				log.debug({ moduleId: provider.moduleId }, 'Skipping disabled context provider');
				continue;
			}

			// Also check the provider's own isEnabled (runtime check)
			const runtimeEnabled = await provider.isEnabled();
			if (!runtimeEnabled) continue;

			const context = await provider.getContext();
			const tokenEstimate = provider.estimateTokens(context);

			// Check if we have room
			if (totalTokens + tokenEstimate > maxTokens) {
				log.info('Skipping context module - would exceed token limit', { moduleId: provider.moduleId, tokenEstimate, currentTotal: totalTokens, maxTokens });
				continue;
			}

			let content = provider.formatForPrompt(context);

			// Append custom context if configured
			if (config.customContext) {
				content += `\n\n### Additional Notes\n${config.customContext}`;
			}

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

	// Use Pacific timezone for all date references
	const pacificParts = getPacificDateParts(now);
	const today = toPacificDateString(now);
	const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	// Calculate end of week (Sunday) in Pacific
	const dayOfWeek = pacificParts.weekday; // 0 = Sunday, 6 = Saturday
	const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
	const endOfWeek = new Date(now);
	endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
	const endOfWeekStr = toPacificDateString(endOfWeek);

	// Calculate end of next week
	const endOfNextWeek = new Date(endOfWeek);
	endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
	const endOfNextWeekStr = toPacificDateString(endOfNextWeek);

	const header = `# Current State (as of ${toPacificDateTimeString(now)} Pacific)

## IMPORTANT: Date Reference (use these exact dates for tools)
- **Today's date**: ${today} (${weekdayNames[dayOfWeek]})
- **End of this week (Sunday)**: ${endOfWeekStr}
- **End of next week**: ${endOfNextWeekStr}
- For "rest of the week" schedules, use date="${today}" and endDate="${endOfWeekStr}"

`;
	const body = context.modules.map(m => m.content).join('\n\n');
	return header + body;
}

export { attendanceProvider, tasksProvider, usersProvider, locationsProvider, memoryProvider };
