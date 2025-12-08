// Architect Context Providers Index
import { specContextProvider } from './spec';
import { schemaContextProvider } from './schema';
import { codebaseContextProvider } from './codebase';
import { mentatsContextProvider } from './mentats';
import type { AIContextProvider, AssembledContext } from '../../types';

export { specContextProvider } from './spec';
export { schemaContextProvider } from './schema';
export { codebaseContextProvider } from './codebase';
export { mentatsContextProvider } from './mentats';

// All architect context providers
export const architectContextProviders: AIContextProvider[] = [
	specContextProvider,
	schemaContextProvider,
	codebaseContextProvider,
	mentatsContextProvider
];

// Module IDs for selective context loading
export const ARCHITECT_CONTEXT_MODULES = {
	spec: 'spec',
	schema: 'schema',
	codebase: 'codebase',
	mentats: 'mentats'
} as const;

export type ArchitectContextModule = keyof typeof ARCHITECT_CONTEXT_MODULES;

/**
 * Assemble context for the architect agent
 * @param moduleIds - Optional list of specific modules to include. If empty, includes all.
 * @param maxTokens - Maximum tokens to include (will truncate if necessary)
 */
export async function assembleArchitectContext(
	moduleIds?: string[],
	maxTokens: number = 16000
): Promise<AssembledContext> {
	const providers = moduleIds?.length
		? architectContextProviders.filter(p => moduleIds.includes(p.moduleId))
		: architectContextProviders;

	// Sort by priority (lower = higher priority)
	const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);

	const modules: AssembledContext['modules'] = [];
	let totalTokens = 0;

	for (const provider of sortedProviders) {
		if (!await provider.isEnabled()) continue;

		const context = await provider.getContext();
		const tokenEstimate = provider.estimateTokens(context);

		// Check if we have room
		if (totalTokens + tokenEstimate > maxTokens) {
			console.log(`[Architect Context] Skipping ${provider.moduleId} - would exceed token limit`);
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
	}

	// Build summary
	const summary: Record<string, number> = {};
	for (const mod of modules) {
		summary[mod.moduleId] = mod.tokenEstimate;
	}

	return {
		timestamp: new Date(),
		agent: 'architect',
		modules,
		totalTokens,
		summary
	};
}

/**
 * Format assembled context for the prompt
 */
export function formatArchitectContext(context: AssembledContext): string {
	const header = `# Context for Architecture Analysis

**Generated:** ${context.timestamp.toISOString()}
**Modules Loaded:** ${context.modules.map(m => m.moduleName).join(', ')}
**Total Tokens:** ~${context.totalTokens}

---

`;

	const body = context.modules.map(m => m.content).join('\n\n---\n\n');

	return header + body;
}
