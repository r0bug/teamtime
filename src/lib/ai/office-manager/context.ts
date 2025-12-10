// Office Manager Context Assembly
// Gathers relevant context for the Office Manager chat

import { assembleContext, formatContextForPrompt } from '../context';

/**
 * Assemble context specifically for Office Manager chat
 * Returns a formatted string ready to include in the prompt
 */
export async function assembleOfficeManagerContext(maxTokens = 3000): Promise<string> {
	const context = await assembleContext('office_manager', maxTokens);
	return formatContextForPrompt(context);
}

/**
 * Get a summary of available context (for debugging/display)
 */
export async function getContextSummary(): Promise<{
	totalTokens: number;
	modules: string[];
	summary: Record<string, number>;
}> {
	const context = await assembleContext('office_manager', 4000);
	return {
		totalTokens: context.totalTokens,
		modules: context.modules.map(m => m.moduleName),
		summary: context.summary
	};
}
