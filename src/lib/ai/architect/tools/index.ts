// Architect Tools Index
import { createClaudePromptTool } from './create-claude-prompt';
import { createDecisionTool } from './create-decision';
import { analyzeImpactTool } from './analyze-impact';
import { readFilesTool, searchFilesTool } from './read-files';
import type { AITool } from '../../types';

export { createClaudePromptTool } from './create-claude-prompt';
export { createDecisionTool } from './create-decision';
export { analyzeImpactTool } from './analyze-impact';
export { readFilesTool, searchFilesTool } from './read-files';

// All architect tools
export const architectTools: AITool<unknown, unknown>[] = [
	createClaudePromptTool as AITool<unknown, unknown>,
	createDecisionTool as AITool<unknown, unknown>,
	analyzeImpactTool as AITool<unknown, unknown>,
	readFilesTool as AITool<unknown, unknown>,
	searchFilesTool as AITool<unknown, unknown>
];

// Tool names for reference
export const ARCHITECT_TOOL_NAMES = {
	createPrompt: 'create_claude_code_prompt',
	createDecision: 'create_architecture_decision',
	analyzeImpact: 'analyze_change_impact',
	readFiles: 'read_files',
	searchFiles: 'search_files'
} as const;

/**
 * Get architect tools formatted for the LLM
 */
export function getArchitectToolsForLLM(): {
	name: string;
	description: string;
	parameters: object;
}[] {
	return architectTools.map(tool => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}

/**
 * Find a tool by name
 */
export function getArchitectToolByName(name: string): AITool<unknown, unknown> | undefined {
	return architectTools.find(t => t.name === name);
}

/**
 * Execute a tool by name
 */
export async function executeArchitectTool(
	toolName: string,
	params: unknown,
	context: { runId?: string; chatId?: string; userId?: string }
): Promise<{
	success: boolean;
	result?: unknown;
	formattedResult?: string;
	error?: string;
}> {
	const tool = getArchitectToolByName(toolName);

	if (!tool) {
		return {
			success: false,
			error: `Unknown tool: ${toolName}`
		};
	}

	// Validate parameters
	if (tool.validate) {
		const validation = tool.validate(params);
		if (!validation.valid) {
			return {
				success: false,
				error: validation.error || 'Validation failed'
			};
		}
	}

	// Execute the tool
	try {
		const result = await tool.execute(params, context);
		return {
			success: true,
			result,
			formattedResult: tool.formatResult ? tool.formatResult(result) : JSON.stringify(result)
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Tool execution failed'
		};
	}
}
