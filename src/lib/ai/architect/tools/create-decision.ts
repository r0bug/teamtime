// Create Architecture Decision Tool
import { db, architectureDecisions } from '$lib/server/db';
import type { AITool, ToolExecutionContext } from '../../types';

interface ImplementationPhase {
	name: string;
	tasks: string[];
	dependencies?: string[];
}

interface CreateDecisionParams {
	title: string;
	category: 'schema' | 'api' | 'ui' | 'integration' | 'security' | 'architecture';
	context: string;
	decision: string;
	consequences?: string;
	implementationPhases?: ImplementationPhase[];
	relatedFiles?: string[];
}

interface CreateDecisionResult {
	success: boolean;
	decisionId?: string;
	title?: string;
	error?: string;
}

export const createDecisionTool: AITool<CreateDecisionParams, CreateDecisionResult> = {
	name: 'create_architecture_decision',
	description: 'Create an Architecture Decision Record (ADR) to document a significant technical decision.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Brief, descriptive title for the decision (e.g., "Use PostgreSQL for primary database")'
			},
			category: {
				type: 'string',
				enum: ['schema', 'api', 'ui', 'integration', 'security', 'architecture'],
				description: 'Category of the architectural decision'
			},
			context: {
				type: 'string',
				description: 'Background explaining why this decision is needed. What problem are we solving?'
			},
			decision: {
				type: 'string',
				description: 'Clear statement of what we decided to do'
			},
			consequences: {
				type: 'string',
				description: 'Tradeoffs and implications of this decision (positive and negative)'
			},
			implementationPhases: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						tasks: { type: 'array', items: { type: 'string' } },
						dependencies: { type: 'array', items: { type: 'string' } }
					},
					required: ['name', 'tasks']
				},
				description: 'Phased implementation plan with tasks and dependencies'
			},
			relatedFiles: {
				type: 'array',
				items: { type: 'string' },
				description: 'File paths that will be affected by this decision'
			}
		},
		required: ['title', 'category', 'context', 'decision']
	},

	requiresApproval: true, // ADRs should be reviewed
	rateLimit: {
		maxPerHour: 10
	},

	validate(params: CreateDecisionParams) {
		if (!params.title || params.title.length < 10) {
			return { valid: false, error: 'Title must be at least 10 characters' };
		}
		if (!params.context || params.context.length < 50) {
			return { valid: false, error: 'Context must be at least 50 characters to adequately explain the background' };
		}
		if (!params.decision || params.decision.length < 20) {
			return { valid: false, error: 'Decision must be at least 20 characters' };
		}
		const validCategories = ['schema', 'api', 'ui', 'integration', 'security', 'architecture'];
		if (!validCategories.includes(params.category)) {
			return { valid: false, error: `Category must be one of: ${validCategories.join(', ')}` };
		}
		return { valid: true };
	},

	async execute(params: CreateDecisionParams, context: ToolExecutionContext): Promise<CreateDecisionResult> {
		try {
			const [decision] = await db
				.insert(architectureDecisions)
				.values({
					title: params.title,
					status: 'proposed',
					category: params.category,
					context: params.context,
					decision: params.decision,
					consequences: params.consequences,
					implementationPlan: params.implementationPhases
						? { phases: params.implementationPhases }
						: undefined,
					relatedFiles: params.relatedFiles,
					createdByAiRunId: context.runId,
					createdByChatId: context.chatId
				})
				.returning({ id: architectureDecisions.id });

			return {
				success: true,
				decisionId: decision.id,
				title: params.title
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error creating decision'
			};
		}
	},

	formatResult(result: CreateDecisionResult): string {
		if (result.success) {
			return `Architecture Decision Record created: "${result.title}" (ID: ${result.decisionId}). Status: Proposed - awaiting approval.`;
		}
		return `Failed to create ADR: ${result.error}`;
	}
};
