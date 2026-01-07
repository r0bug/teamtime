// Toggle Task Rule Tool - Enable or disable task assignment rules
import { db, taskAssignmentRules, auditLogs, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:toggle-task-rule');

interface ToggleTaskRuleParams {
	ruleId: string;
	isActive: boolean;
	reason?: string;
}

interface ToggleTaskRuleResult {
	success: boolean;
	ruleId?: string;
	ruleName?: string;
	newState?: boolean;
	error?: string;
}

export const toggleTaskRuleTool: AITool<ToggleTaskRuleParams, ToggleTaskRuleResult> = {
	name: 'toggle_task_rule',
	description: 'Enable or disable a task assignment rule. Disabled rules will not trigger automatically.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			ruleId: {
				type: 'string',
				description: 'The ID of the rule to toggle'
			},
			isActive: {
				type: 'boolean',
				description: 'Whether the rule should be active (true) or inactive (false)'
			},
			reason: {
				type: 'string',
				description: 'Optional reason for the state change (stored in audit log)'
			}
		},
		required: ['ruleId', 'isActive']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 5
	},
	rateLimit: {
		maxPerHour: 30
	},

	getConfirmationMessage(params: ToggleTaskRuleParams): string {
		const action = params.isActive ? 'enable' : 'disable';
		return `Are you sure you want to ${action} this task rule?`;
	},

	validate(params: ToggleTaskRuleParams) {
		if (!params.ruleId || params.ruleId.trim().length === 0) {
			return { valid: false, error: 'Rule ID is required' };
		}
		if (!isValidUUID(params.ruleId)) {
			return {
				valid: false,
				error: `Invalid ruleId format: "${params.ruleId}". Expected a UUID.`
			};
		}
		if (typeof params.isActive !== 'boolean') {
			return { valid: false, error: 'isActive must be a boolean' };
		}
		if (params.reason && params.reason.length > 500) {
			return { valid: false, error: 'Reason too long (max 500 chars)' };
		}
		return { valid: true };
	},

	async execute(params: ToggleTaskRuleParams, context: ToolExecutionContext): Promise<ToggleTaskRuleResult> {
		if (context.dryRun) {
			return {
				success: true,
				newState: params.isActive,
				error: `Dry run - rule would be ${params.isActive ? 'enabled' : 'disabled'}`
			};
		}

		try {
			// Get the rule to verify it exists and get info
			const [rule] = await db
				.select({
					id: taskAssignmentRules.id,
					name: taskAssignmentRules.name,
					isActive: taskAssignmentRules.isActive
				})
				.from(taskAssignmentRules)
				.where(eq(taskAssignmentRules.id, params.ruleId))
				.limit(1);

			if (!rule) {
				return { success: false, error: 'Rule not found' };
			}

			// Check if already in desired state
			if (rule.isActive === params.isActive) {
				return {
					success: true,
					ruleId: params.ruleId,
					ruleName: rule.name,
					newState: params.isActive,
					error: `Rule is already ${params.isActive ? 'active' : 'inactive'}`
				};
			}

			// Update the rule
			await db
				.update(taskAssignmentRules)
				.set({
					isActive: params.isActive,
					updatedAt: new Date()
				})
				.where(eq(taskAssignmentRules.id, params.ruleId));

			// Get admin user for audit log
			const [admin] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			// Create audit log entry
			if (admin) {
				await db.insert(auditLogs).values({
					userId: admin.id,
					action: 'update',
					entityType: 'task_assignment_rule',
					entityId: params.ruleId,
					beforeData: { isActive: rule.isActive },
					afterData: {
						isActive: params.isActive,
						toggledByOfficeManager: true,
						reason: params.reason || 'No reason provided'
					}
				});
			}

			log.info({
			ruleId: params.ruleId,
			ruleName: rule.name,
			previousState: rule.isActive,
			newState: params.isActive,
			reason: params.reason
		}, 'Task rule toggled by Office Manager');

			return {
				success: true,
				ruleId: params.ruleId,
				ruleName: rule.name,
				newState: params.isActive
			};
		} catch (error) {
			log.error({ error }, 'Toggle task rule tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ToggleTaskRuleResult): string {
		if (result.success) {
			const state = result.newState ? 'enabled' : 'disabled';
			return `Rule "${result.ruleName}" has been ${state}.`;
		}
		return `Failed to toggle rule: ${result.error}`;
	}
};
