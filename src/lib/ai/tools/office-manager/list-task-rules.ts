// List Task Rules Tool - View all task assignment rules
import { db, taskAssignmentRules, taskTemplates, cashCountConfigs, locations } from '$lib/server/db';
import { eq, and, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:list-task-rules');

interface ListTaskRulesParams {
	triggerType?: string;
	locationId?: string;
	activeOnly?: boolean;
}

interface TaskRuleInfo {
	id: string;
	name: string;
	description: string | null;
	triggerType: string;
	templateName: string | null;
	cashCountConfigName: string | null;
	locationName: string | null;
	conditions: string;
	assignmentType: string;
	isActive: boolean;
	lastTriggered: string | null;
	triggerCount: number;
}

interface ListTaskRulesResult {
	success: boolean;
	rules: TaskRuleInfo[];
	totalCount: number;
	error?: string;
}

function formatConditions(conditions: Record<string, unknown> | null): string {
	if (!conditions) return 'None';
	const parts: string[] = [];

	if (conditions.locationId) parts.push(`Location filter`);
	if (conditions.roles && Array.isArray(conditions.roles)) {
		parts.push(`Roles: ${(conditions.roles as string[]).join(', ')}`);
	}
	if (conditions.daysOfWeek && Array.isArray(conditions.daysOfWeek)) {
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const days = (conditions.daysOfWeek as number[]).map(d => dayNames[d]).join(', ');
		parts.push(`Days: ${days}`);
	}
	if (conditions.timeWindowStart || conditions.timeWindowEnd) {
		parts.push(`Time: ${conditions.timeWindowStart || '00:00'} - ${conditions.timeWindowEnd || '23:59'}`);
	}

	return parts.length > 0 ? parts.join('; ') : 'None';
}

export const listTaskRulesTool: AITool<ListTaskRulesParams, ListTaskRulesResult> = {
	name: 'list_task_rules',
	description: 'View all task assignment rules. Shows rule names, trigger types, templates, conditions, and trigger statistics. Can filter by trigger type, location, or active status.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			triggerType: {
				type: 'string',
				description: 'Filter by trigger type (clock_in, clock_out, first_clock_in, last_clock_out, time_into_shift, task_completed, schedule, closing_shift)',
				enum: ['clock_in', 'clock_out', 'first_clock_in', 'last_clock_out', 'time_into_shift', 'task_completed', 'schedule', 'closing_shift']
			},
			locationId: {
				type: 'string',
				description: 'Filter by location ID'
			},
			activeOnly: {
				type: 'boolean',
				description: 'Only show active rules (default: true)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false, // Read-only

	validate(params: ListTaskRulesParams) {
		const validTriggers = ['clock_in', 'clock_out', 'first_clock_in', 'last_clock_out', 'time_into_shift', 'task_completed', 'schedule', 'closing_shift'];
		if (params.triggerType && !validTriggers.includes(params.triggerType)) {
			return { valid: false, error: `Invalid trigger type. Must be one of: ${validTriggers.join(', ')}` };
		}
		return { valid: true };
	},

	async execute(params: ListTaskRulesParams, context: ToolExecutionContext): Promise<ListTaskRulesResult> {
		try {
			const activeOnly = params.activeOnly !== false; // Default to true

			// Build query with joins to get template and config names
			const rulesQuery = db
				.select({
					id: taskAssignmentRules.id,
					name: taskAssignmentRules.name,
					description: taskAssignmentRules.description,
					triggerType: taskAssignmentRules.triggerType,
					conditions: taskAssignmentRules.conditions,
					assignmentType: taskAssignmentRules.assignmentType,
					isActive: taskAssignmentRules.isActive,
					lastTriggeredAt: taskAssignmentRules.lastTriggeredAt,
					triggerCount: taskAssignmentRules.triggerCount,
					templateName: taskTemplates.name,
					cashCountConfigName: cashCountConfigs.name
				})
				.from(taskAssignmentRules)
				.leftJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
				.leftJoin(cashCountConfigs, eq(taskAssignmentRules.cashCountConfigId, cashCountConfigs.id));

			// Apply filters
			const conditions: ReturnType<typeof eq>[] = [];
			if (activeOnly) {
				conditions.push(eq(taskAssignmentRules.isActive, true));
			}
			if (params.triggerType) {
				conditions.push(sql`${taskAssignmentRules.triggerType} = ${params.triggerType}`);
			}

			let results;
			if (conditions.length > 0) {
				results = await rulesQuery.where(and(...conditions));
			} else {
				results = await rulesQuery;
			}

			// Get location names for rules with location conditions
			const locationIds = new Set<string>();
			for (const rule of results) {
				const conds = rule.conditions as Record<string, unknown> | null;
				if (conds?.locationId && typeof conds.locationId === 'string') {
					locationIds.add(conds.locationId);
				}
			}

			const locationMap = new Map<string, string>();
			if (locationIds.size > 0) {
				const locs = await db
					.select({ id: locations.id, name: locations.name })
					.from(locations)
					.where(sql`${locations.id} IN (${sql.join([...locationIds].map(id => sql`${id}`), sql`, `)})`);
				for (const loc of locs) {
					locationMap.set(loc.id, loc.name);
				}
			}

			// Filter by location if specified
			let filteredResults = results;
			if (params.locationId) {
				filteredResults = results.filter(rule => {
					const conds = rule.conditions as Record<string, unknown> | null;
					return conds?.locationId === params.locationId;
				});
			}

			// Format results
			const rules: TaskRuleInfo[] = filteredResults.map(rule => {
				const conds = rule.conditions as Record<string, unknown> | null;
				const locationId = conds?.locationId as string | undefined;

				return {
					id: rule.id,
					name: rule.name,
					description: rule.description,
					triggerType: rule.triggerType,
					templateName: rule.templateName,
					cashCountConfigName: rule.cashCountConfigName,
					locationName: locationId ? locationMap.get(locationId) || null : null,
					conditions: formatConditions(conds),
					assignmentType: rule.assignmentType,
					isActive: rule.isActive,
					lastTriggered: rule.lastTriggeredAt?.toISOString() || null,
					triggerCount: rule.triggerCount
				};
			});

			return {
				success: true,
				rules,
				totalCount: rules.length
			};
		} catch (error) {
			log.error({ error }, 'List task rules tool error');
			return {
				success: false,
				rules: [],
				totalCount: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ListTaskRulesResult): string {
		if (!result.success) {
			return `Failed to list task rules: ${result.error}`;
		}

		if (result.rules.length === 0) {
			return 'No task rules found matching the criteria.';
		}

		const lines = [`Found ${result.totalCount} task rule(s):\n`];
		for (const rule of result.rules) {
			const status = rule.isActive ? 'Active' : 'Inactive';
			const target = rule.templateName || rule.cashCountConfigName || 'Unknown';
			const triggered = rule.lastTriggered
				? `Last: ${new Date(rule.lastTriggered).toLocaleDateString()}, Count: ${rule.triggerCount}`
				: 'Never triggered';

			lines.push(`- ${rule.name} [${status}]`);
			lines.push(`  Trigger: ${rule.triggerType} -> ${target}`);
			lines.push(`  Assignment: ${rule.assignmentType}`);
			if (rule.locationName) {
				lines.push(`  Location: ${rule.locationName}`);
			}
			lines.push(`  Conditions: ${rule.conditions}`);
			lines.push(`  Stats: ${triggered}`);
			lines.push('');
		}

		return lines.join('\n');
	}
};
