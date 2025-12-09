// Create Claude Code Prompt Tool
import { db, architectureDecisions } from '$lib/server/db';
import type { AITool, ToolExecutionContext } from '../../types';

interface CreatePromptParams {
	title: string;
	context: string;
	requirements: string[] | string; // AI sometimes sends as string
	filesToModify: string[] | string; // AI sometimes sends as string
	implementationNotes?: string;
	testingGuidance?: string;
	saveAsDecision?: boolean;
	category?: 'schema' | 'api' | 'ui' | 'integration' | 'security' | 'architecture';
}

interface CreatePromptResult {
	success: boolean;
	prompt: string;
	decisionId?: string;
	error?: string;
}

export const createClaudePromptTool: AITool<CreatePromptParams, CreatePromptResult> = {
	name: 'create_claude_code_prompt',
	description: 'Generate a well-structured prompt for Claude Code to implement a feature or change. Optionally saves as an Architecture Decision Record.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Brief task title (e.g., "Add inventory tracking tables")'
			},
			context: {
				type: 'string',
				description: 'Background information about why this change is needed'
			},
			requirements: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of specific requirements to implement'
			},
			filesToModify: {
				type: 'array',
				items: { type: 'string' },
				description: 'File paths that need to be created or modified'
			},
			implementationNotes: {
				type: 'string',
				description: 'Technical guidance for implementation'
			},
			testingGuidance: {
				type: 'string',
				description: 'How to verify the implementation works'
			},
			saveAsDecision: {
				type: 'boolean',
				description: 'Whether to save this as an Architecture Decision Record'
			},
			category: {
				type: 'string',
				enum: ['schema', 'api', 'ui', 'integration', 'security', 'architecture'],
				description: 'Category for the decision record'
			}
		},
		required: ['title', 'context', 'requirements', 'filesToModify']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 20
	},

	validate(params: CreatePromptParams) {
		if (!params.title || params.title.length < 5) {
			return { valid: false, error: 'Title must be at least 5 characters' };
		}
		if (!params.context || params.context.length < 20) {
			return { valid: false, error: 'Context must be at least 20 characters' };
		}
		// Accept both string and array for requirements
		const hasRequirements = params.requirements && (
			(Array.isArray(params.requirements) && params.requirements.length > 0) ||
			(typeof params.requirements === 'string' && params.requirements.trim().length > 0)
		);
		if (!hasRequirements) {
			return { valid: false, error: 'At least one requirement is needed' };
		}
		// Accept both string and array for filesToModify
		const hasFiles = params.filesToModify && (
			(Array.isArray(params.filesToModify) && params.filesToModify.length > 0) ||
			(typeof params.filesToModify === 'string' && params.filesToModify.trim().length > 0)
		);
		if (!hasFiles) {
			return { valid: false, error: 'At least one file to modify must be specified' };
		}
		return { valid: true };
	},

	async execute(params: CreatePromptParams, context: ToolExecutionContext): Promise<CreatePromptResult> {
		try {
			// Normalize requirements and filesToModify to arrays
			const requirements = Array.isArray(params.requirements)
				? params.requirements
				: (typeof params.requirements === 'string'
					? params.requirements.split('\n').map(r => r.replace(/^[-*•]\s*/, '').trim()).filter(r => r)
					: []);

			const filesToModify = Array.isArray(params.filesToModify)
				? params.filesToModify
				: (typeof params.filesToModify === 'string'
					? params.filesToModify.split('\n').map(f => f.replace(/^[-*•]\s*/, '').trim()).filter(f => f)
					: []);

			// Build the Claude Code prompt
			const prompt = formatClaudeCodePrompt(params);

			let decisionId: string | undefined;

			// Optionally save as an Architecture Decision
			if (params.saveAsDecision) {
				const [decision] = await db
					.insert(architectureDecisions)
					.values({
						title: params.title,
						status: 'proposed',
						category: params.category || 'architecture',
						context: params.context,
						decision: `Implement: ${requirements.join('; ')}`,
						claudeCodePrompt: prompt,
						relatedFiles: filesToModify,
						createdByAiRunId: context.runId
					})
					.returning({ id: architectureDecisions.id });

				decisionId = decision.id;
			}

			return {
				success: true,
				prompt,
				decisionId
			};
		} catch (error) {
			return {
				success: false,
				prompt: '',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreatePromptResult): string {
		if (result.success) {
			let msg = 'Claude Code prompt generated successfully.';
			if (result.decisionId) {
				msg += ` Saved as Architecture Decision ${result.decisionId}.`;
			}
			return msg;
		}
		return `Failed to create prompt: ${result.error}`;
	}
};

function formatClaudeCodePrompt(params: CreatePromptParams): string {
	const sections: string[] = [];

	// Normalize requirements to array (AI sometimes sends string instead of array)
	const requirements = Array.isArray(params.requirements)
		? params.requirements
		: (typeof params.requirements === 'string'
			? params.requirements.split('\n').map(r => r.replace(/^[-*•]\s*/, '').trim()).filter(r => r)
			: []);

	// Normalize filesToModify to array
	const filesToModify = Array.isArray(params.filesToModify)
		? params.filesToModify
		: (typeof params.filesToModify === 'string'
			? params.filesToModify.split('\n').map(f => f.replace(/^[-*•]\s*/, '').trim()).filter(f => f)
			: []);

	sections.push(`# Task: ${params.title}`);
	sections.push('');
	sections.push('## Context');
	sections.push(params.context);
	sections.push('');
	sections.push('## Requirements');
	requirements.forEach((req, i) => {
		sections.push(`${i + 1}. ${req}`);
	});
	sections.push('');
	sections.push('## Files to Modify/Create');
	filesToModify.forEach(f => {
		sections.push(`- \`${f}\``);
	});

	if (params.implementationNotes) {
		sections.push('');
		sections.push('## Implementation Notes');
		sections.push(params.implementationNotes);
	}

	if (params.testingGuidance) {
		sections.push('');
		sections.push('## Testing');
		sections.push(params.testingGuidance);
	}

	sections.push('');
	sections.push('---');
	sections.push('*Generated by Ada - TeamTime Architecture Advisor*');

	return sections.join('\n');
}
