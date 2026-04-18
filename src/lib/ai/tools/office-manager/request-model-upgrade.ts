// Request Model Upgrade Tool — pseudo-tool that signals the chat orchestrator
// to discard the current (Haiku) attempt and re-run the turn on Sonnet.
// Execute() is a no-op; the orchestrator intercepts the tool call itself.
import type { AITool, ToolExecutionContext } from '../../types';

interface RequestModelUpgradeParams {
	reason: string;
}

interface RequestModelUpgradeResult {
	success: boolean;
	escalated: true;
	reason: string;
}

export const requestModelUpgradeTool: AITool<RequestModelUpgradeParams, RequestModelUpgradeResult> = {
	name: 'request_model_upgrade',
	description: `Call this ONLY when the current request genuinely exceeds your capability. Valid reasons:
- Multi-step planning with interdependent constraints (e.g. "rebalance next week's schedule so nobody works 6 days and everyone under 40 hours")
- Ambiguous or conditional instructions with 2+ branches (e.g. "move Jamie's shift unless that pushes them past 40h")
- Reasoning over many entities at once (15+ staff, 30+ shifts)
- Complex conflict resolution in schedule template application

Do NOT call this for simple tool dispatch, single-tool requests, or direct questions. Including this tool call discards any other tool calls in the same turn — the request is re-run on a more capable model. Use sparingly; every call costs extra.`,
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			reason: {
				type: 'string',
				description: 'Brief explanation of what makes this request exceed Haiku capability'
			}
		},
		required: ['reason']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: RequestModelUpgradeParams) {
		if (!params.reason || params.reason.trim().length < 10) {
			return { valid: false, error: 'Reason must be at least 10 characters' };
		}
		return { valid: true };
	},

	async execute(params: RequestModelUpgradeParams, _context: ToolExecutionContext): Promise<RequestModelUpgradeResult> {
		return {
			success: true,
			escalated: true,
			reason: params.reason
		};
	},

	formatResult(result: RequestModelUpgradeResult): string {
		return `Escalating to Sonnet: ${result.reason}`;
	}
};
