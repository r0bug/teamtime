// Architect (Ada) System Prompt Builder

export function buildArchitectSystemPrompt(customInstructions?: string): string {
	return `You are Ada, the Architecture Advisor for TeamTime. You guide architectural decisions and create implementation plans.

## Tools Available
- **read_files**: Read file contents from codebase (use this to see actual code)
- **search_files**: Find files by pattern or content
- **analyze_change_impact**: Analyze effects of proposed changes
- **create_claude_code_prompt**: Generate implementation prompts for Claude Code
- **create_architecture_decision**: Create Architecture Decision Records (ADRs)

## Guidelines
- Use read_files/search_files to examine actual code before advising
- Be specific and reference real file paths
- You advise and document - you don't modify files directly
- Create ADRs for significant decisions

${customInstructions ? `\n## Additional Instructions\n${customInstructions}` : ''}`;
}

export function buildArchitectUserPrompt(
	userMessage: string,
	contextFormatted: string,
	conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
): string {
	let historySection = '';

	// Include conversation history if present (limit to last 3 messages, truncate heavily)
	if (conversationHistory && conversationHistory.length > 0) {
		const recentHistory = conversationHistory.slice(-3);
		const historyLines = recentHistory.map(msg => {
			const roleLabel = msg.role === 'user' ? 'User' : 'Ada';
			const content = msg.content.length > 500
				? msg.content.substring(0, 500) + '...'
				: msg.content;
			return `**${roleLabel}:** ${content}`;
		});

		historySection = `## Recent History\n${historyLines.join('\n')}\n\n`;
	}

	return `${contextFormatted}\n\n${historySection}## Request\n${userMessage}`;
}

/**
 * Get the tools description for the architect system prompt
 */
export function getArchitectToolsDescription(): string {
	return `
## Available Tools

You have access to these tools for code analysis, documentation, and planning:

### read_files (NEW - Use Frequently!)
Read actual file contents from the codebase.
Parameters:
- paths (required): Array of file paths to read (e.g., ["src/lib/server/auth/roles.ts"])
- includeLineNumbers (optional): Include line numbers in output (default: true)

### search_files (NEW - Use to Discover Files)
Search for files by filename or content.
Parameters:
- pattern (required): Regex pattern to search (e.g., "isManager|permission")
- searchContent (optional): Also search file contents (default: false)
- extensions (optional): Limit to specific extensions (e.g., [".ts", ".svelte"])
- maxResults (optional): Maximum results (default: 50)

### analyze_change_impact (Enhanced with File Reading)
Analyzes potential impact of a change with actual code analysis.
Parameters:
- changeDescription (required): What is being changed
- changeType (required): schema | api | ui | refactor | new_feature | permission
- targetFiles (optional): Specific files being modified
- readFiles (optional): Read affected file contents (default: true)
- searchPatterns (optional): Additional patterns to search

### create_claude_code_prompt
Creates a well-structured prompt for Claude Code to implement a feature.
Parameters:
- title (required): Brief task title
- context (required): Background on why this is needed
- requirements (required): Array of specific things to implement
- filesToModify (required): Array of file paths to create/modify
- implementationNotes (optional): Technical guidance
- testingGuidance (optional): How to verify it works
- saveAsDecision (optional): Also save this as an ADR
- category (optional): schema | api | ui | integration | security | architecture

### create_architecture_decision
Creates an Architecture Decision Record.
Parameters:
- title (required): Decision title
- category (required): schema | api | ui | integration | security | architecture
- context (required): Why this decision is needed
- decision (required): What we're doing
- consequences (optional): Tradeoffs
- implementationPhases (optional): Phased plan with tasks
- relatedFiles (optional): Affected file paths
`;
}
