// Continue Work Tool - Signals the AI wants to perform additional actions
import type { AITool, ToolExecutionContext } from '../../types';

interface ContinueWorkParams {
	reason: string;
	remainingTasks: string[];
}

interface ContinueWorkResult {
	success: boolean;
	shouldContinue: boolean;
	remainingTasks: string[];
}

export const continueWorkTool: AITool<ContinueWorkParams, ContinueWorkResult> = {
	name: 'continue_work',
	description: 'Signal that you have more tasks to complete after the current action. Use this when a situation requires multiple coordinated actions (e.g., trade a shift AND notify both users). List the remaining tasks you need to perform.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			reason: {
				type: 'string',
				description: 'Brief explanation of why additional actions are needed'
			},
			remainingTasks: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of remaining tasks to complete (e.g., ["notify user A", "notify user B"])'
			}
		},
		required: ['reason', 'remainingTasks']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ContinueWorkParams) {
		if (!params.reason || params.reason.trim().length < 5) {
			return { valid: false, error: 'Reason is required' };
		}
		if (!params.remainingTasks || params.remainingTasks.length === 0) {
			return { valid: false, error: 'At least one remaining task is required' };
		}
		if (params.remainingTasks.length > 5) {
			return { valid: false, error: 'Maximum 5 remaining tasks allowed' };
		}
		return { valid: true };
	},

	async execute(params: ContinueWorkParams, context: ToolExecutionContext): Promise<ContinueWorkResult> {
		// This tool doesn't actually do anything - it's a signal to the orchestrator
		return {
			success: true,
			shouldContinue: true,
			remainingTasks: params.remainingTasks
		};
	},

	formatResult(result: ContinueWorkResult): string {
		if (result.success) {
			return `Continuing with ${result.remainingTasks.length} more task(s)`;
		}
		return 'Continue signal processed';
	}
};
