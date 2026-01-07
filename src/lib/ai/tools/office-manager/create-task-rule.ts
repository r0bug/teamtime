// Create Task Rule Tool - Create automated task assignment rules
import { db, taskAssignmentRules, taskTemplates, cashCountConfigs, locations, auditLogs, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:create-task-rule');

type TriggerType = 'clock_in' | 'clock_out' | 'first_clock_in' | 'last_clock_out' | 'time_into_shift' | 'task_completed' | 'schedule' | 'closing_shift';
type AssignmentType = 'clocked_in_user' | 'specific_user' | 'role_rotation' | 'location_staff' | 'least_tasks';

interface CreateTaskRuleParams {
	name: string;
	description?: string;
	templateId?: string;
	cashCountConfigId?: string;
	triggerType: TriggerType;
	triggerConfig?: {
		hoursIntoShift?: number;
		taskTemplateId?: string;
		cronExpression?: string;
		triggerTime?: string;
	};
	conditions?: {
		locationId?: string;
		roles?: string[];
		daysOfWeek?: number[];
		timeWindowStart?: string;
		timeWindowEnd?: string;
	};
	assignmentType: AssignmentType;
	assignmentConfig?: {
		userId?: string;
		roles?: string[];
	};
	priority?: number;
}

interface CreateTaskRuleResult {
	success: boolean;
	ruleId?: string;
	ruleName?: string;
	triggerDescription?: string;
	error?: string;
}

const VALID_TRIGGER_TYPES: TriggerType[] = ['clock_in', 'clock_out', 'first_clock_in', 'last_clock_out', 'time_into_shift', 'task_completed', 'schedule', 'closing_shift'];
const VALID_ASSIGNMENT_TYPES: AssignmentType[] = ['clocked_in_user', 'specific_user', 'role_rotation', 'location_staff', 'least_tasks'];

function describeTrigger(triggerType: TriggerType, triggerConfig?: CreateTaskRuleParams['triggerConfig']): string {
	switch (triggerType) {
		case 'clock_in': return 'When a user clocks in';
		case 'clock_out': return 'When a user clocks out';
		case 'first_clock_in': return 'When the first person clocks in at a location';
		case 'last_clock_out': return 'When the last person clocks out at a location';
		case 'time_into_shift': return `${triggerConfig?.hoursIntoShift || 0} hours into shift`;
		case 'task_completed': return 'When a specific task is completed';
		case 'schedule': return `On schedule: ${triggerConfig?.cronExpression || 'not set'}`;
		case 'closing_shift': return `At ${triggerConfig?.triggerTime || '?'} for clocked-in users`;
		default: return triggerType;
	}
}

export const createTaskRuleTool: AITool<CreateTaskRuleParams, CreateTaskRuleResult> = {
	name: 'create_task_rule',
	description: 'Create an automated task assignment rule. Rules trigger on clock events (in/out, first/last), time into shift, or scheduled times. Configure conditions like location, days of week, and time windows.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'Name of the rule'
			},
			description: {
				type: 'string',
				description: 'Description of what the rule does'
			},
			templateId: {
				type: 'string',
				description: 'Task template ID to create tasks from (required if not using cashCountConfigId)'
			},
			cashCountConfigId: {
				type: 'string',
				description: 'Cash count config ID (required if not using templateId)'
			},
			triggerType: {
				type: 'string',
				description: 'When to trigger: clock_in, clock_out, first_clock_in, last_clock_out, time_into_shift, task_completed, schedule, closing_shift',
				enum: VALID_TRIGGER_TYPES
			},
			triggerConfig: {
				type: 'object',
				description: 'Trigger-specific configuration',
				properties: {
					hoursIntoShift: { type: 'number', description: 'For time_into_shift: hours after clock-in' },
					taskTemplateId: { type: 'string', description: 'For task_completed: which template triggers this' },
					cronExpression: { type: 'string', description: 'For schedule: cron expression (e.g., "0 9 * * 1" for Monday 9am)' },
					triggerTime: { type: 'string', description: 'For closing_shift: time in HH:MM format (e.g., "20:30")' }
				}
			},
			conditions: {
				type: 'object',
				description: 'When the rule should apply',
				properties: {
					locationId: { type: 'string', description: 'Only apply at this location' },
					roles: { type: 'array', items: { type: 'string' }, description: 'User roles that can trigger this' },
					daysOfWeek: { type: 'array', items: { type: 'number' }, description: 'Days of week (0=Sunday, 6=Saturday)' },
					timeWindowStart: { type: 'string', description: 'Start time in HH:MM format' },
					timeWindowEnd: { type: 'string', description: 'End time in HH:MM format' }
				}
			},
			assignmentType: {
				type: 'string',
				description: 'How to assign: clocked_in_user, specific_user, role_rotation, location_staff, least_tasks',
				enum: VALID_ASSIGNMENT_TYPES
			},
			assignmentConfig: {
				type: 'object',
				description: 'Assignment-specific configuration',
				properties: {
					userId: { type: 'string', description: 'For specific_user: which user to assign to' },
					roles: { type: 'array', items: { type: 'string' }, description: 'For role_rotation: which roles to rotate through' }
				}
			},
			priority: {
				type: 'number',
				description: 'Rule priority (higher = runs first)'
			}
		},
		required: ['name', 'triggerType', 'assignmentType']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 30
	},
	rateLimit: {
		maxPerHour: 10
	},

	getConfirmationMessage(params: CreateTaskRuleParams): string {
		return `Create task rule "${params.name}" with trigger: ${describeTrigger(params.triggerType, params.triggerConfig)}?`;
	},

	validate(params: CreateTaskRuleParams) {
		if (!params.name || params.name.trim().length < 3) {
			return { valid: false, error: 'Rule name is required (min 3 chars)' };
		}
		if (params.name.length > 100) {
			return { valid: false, error: 'Rule name too long (max 100 chars)' };
		}
		if (!VALID_TRIGGER_TYPES.includes(params.triggerType)) {
			return { valid: false, error: `Invalid trigger type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` };
		}
		if (!VALID_ASSIGNMENT_TYPES.includes(params.assignmentType)) {
			return { valid: false, error: `Invalid assignment type. Must be one of: ${VALID_ASSIGNMENT_TYPES.join(', ')}` };
		}
		if (!params.templateId && !params.cashCountConfigId) {
			return { valid: false, error: 'Either templateId or cashCountConfigId is required' };
		}
		if (params.templateId && !isValidUUID(params.templateId)) {
			return { valid: false, error: 'Invalid templateId format' };
		}
		if (params.cashCountConfigId && !isValidUUID(params.cashCountConfigId)) {
			return { valid: false, error: 'Invalid cashCountConfigId format' };
		}

		// Trigger-specific validation
		if (params.triggerType === 'time_into_shift' && !params.triggerConfig?.hoursIntoShift) {
			return { valid: false, error: 'time_into_shift requires triggerConfig.hoursIntoShift' };
		}
		if (params.triggerType === 'closing_shift' && !params.triggerConfig?.triggerTime) {
			return { valid: false, error: 'closing_shift requires triggerConfig.triggerTime (HH:MM format)' };
		}
		if (params.triggerType === 'schedule' && !params.triggerConfig?.cronExpression) {
			return { valid: false, error: 'schedule requires triggerConfig.cronExpression' };
		}

		// Assignment-specific validation
		if (params.assignmentType === 'specific_user' && !params.assignmentConfig?.userId) {
			return { valid: false, error: 'specific_user requires assignmentConfig.userId' };
		}

		// Condition validation
		if (params.conditions?.locationId && !isValidUUID(params.conditions.locationId)) {
			return { valid: false, error: 'Invalid locationId format' };
		}
		if (params.conditions?.daysOfWeek) {
			for (const day of params.conditions.daysOfWeek) {
				if (day < 0 || day > 6) {
					return { valid: false, error: 'daysOfWeek must be 0-6 (0=Sunday)' };
				}
			}
		}
		if (params.conditions?.timeWindowStart && !/^\d{2}:\d{2}$/.test(params.conditions.timeWindowStart)) {
			return { valid: false, error: 'timeWindowStart must be in HH:MM format' };
		}
		if (params.conditions?.timeWindowEnd && !/^\d{2}:\d{2}$/.test(params.conditions.timeWindowEnd)) {
			return { valid: false, error: 'timeWindowEnd must be in HH:MM format' };
		}

		return { valid: true };
	},

	async execute(params: CreateTaskRuleParams, context: ToolExecutionContext): Promise<CreateTaskRuleResult> {
		if (context.dryRun) {
			return {
				success: true,
				ruleName: params.name,
				triggerDescription: describeTrigger(params.triggerType, params.triggerConfig),
				error: 'Dry run - rule would be created'
			};
		}

		try {
			// Verify template or config exists
			if (params.templateId) {
				const [template] = await db
					.select({ id: taskTemplates.id })
					.from(taskTemplates)
					.where(eq(taskTemplates.id, params.templateId))
					.limit(1);
				if (!template) {
					return { success: false, error: 'Task template not found' };
				}
			}
			if (params.cashCountConfigId) {
				const [config] = await db
					.select({ id: cashCountConfigs.id })
					.from(cashCountConfigs)
					.where(eq(cashCountConfigs.id, params.cashCountConfigId))
					.limit(1);
				if (!config) {
					return { success: false, error: 'Cash count config not found' };
				}
			}

			// Verify location if specified
			if (params.conditions?.locationId) {
				const [loc] = await db
					.select({ id: locations.id })
					.from(locations)
					.where(eq(locations.id, params.conditions.locationId))
					.limit(1);
				if (!loc) {
					return { success: false, error: 'Location not found' };
				}
			}

			// Create the rule
			const [rule] = await db
				.insert(taskAssignmentRules)
				.values({
					name: params.name.trim(),
					description: params.description?.trim() || null,
					templateId: params.templateId || null,
					cashCountConfigId: params.cashCountConfigId || null,
					triggerType: params.triggerType,
					triggerConfig: params.triggerConfig || {},
					conditions: params.conditions || {},
					assignmentType: params.assignmentType,
					assignmentConfig: params.assignmentConfig || {},
					priority: params.priority || 0,
					isActive: true
				})
				.returning({ id: taskAssignmentRules.id, name: taskAssignmentRules.name });

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
					action: 'create',
					entityType: 'task_assignment_rule',
					entityId: rule.id,
					afterData: {
						createdByOfficeManager: true,
						ruleName: params.name,
						triggerType: params.triggerType,
						assignmentType: params.assignmentType
					}
				});
			}

			log.info({
			ruleId: rule.id,
			ruleName: params.name,
			triggerType: params.triggerType
		}, 'Task rule created by Office Manager');

			return {
				success: true,
				ruleId: rule.id,
				ruleName: rule.name,
				triggerDescription: describeTrigger(params.triggerType, params.triggerConfig)
			};
		} catch (error) {
			log.error({ error }, 'Create task rule tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateTaskRuleResult): string {
		if (result.success) {
			return `Rule "${result.ruleName}" created successfully.\nTrigger: ${result.triggerDescription}\nID: ${result.ruleId}`;
		}
		return `Failed to create rule: ${result.error}`;
	}
};
