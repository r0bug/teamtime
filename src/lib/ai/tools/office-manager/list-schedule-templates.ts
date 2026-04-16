// List Schedule Templates Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { listTemplates } from '$lib/server/services/schedule-template-service';

const log = createLogger('ai:tools:list-schedule-templates');

interface ListScheduleTemplatesParams {
	includeInactive?: boolean;
}

interface TemplateSummary {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
	shiftCount: number;
	days: number[]; // unique days of week covered
}

interface ListScheduleTemplatesResult {
	success: boolean;
	templates?: TemplateSummary[];
	error?: string;
}

export const listScheduleTemplatesTool: AITool<
	ListScheduleTemplatesParams,
	ListScheduleTemplatesResult
> = {
	name: 'list_schedule_templates',
	description:
		'List all saved weekly schedule templates. Each template is a recurring pattern of shifts that can be applied to future weeks. Returns each template with its ID, name, default status, and shift count. Use this to discover templates before applying or validating.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			includeInactive: {
				type: 'boolean',
				description: 'Include templates marked inactive. Default: false.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate() {
		return { valid: true };
	},

	async execute(
		params: ListScheduleTemplatesParams,
		_context: ToolExecutionContext
	): Promise<ListScheduleTemplatesResult> {
		try {
			const all = await listTemplates();
			const filtered = params.includeInactive ? all : all.filter((t) => t.isActive);
			return {
				success: true,
				templates: filtered.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description,
					isDefault: t.isDefault,
					isActive: t.isActive,
					shiftCount: t.shifts.length,
					days: [...new Set(t.shifts.map((s) => s.dayOfWeek))].sort()
				}))
			};
		} catch (err) {
			log.error({ err }, 'list_schedule_templates failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: ListScheduleTemplatesResult): string {
		if (!result.success) return `Failed to list templates: ${result.error}`;
		if (!result.templates || result.templates.length === 0) {
			return 'No schedule templates found.';
		}
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return result.templates
			.map(
				(t) =>
					`- ${t.isDefault ? '★ ' : '  '}${t.name} (${t.shiftCount} shifts, days: ${t.days
						.map((d) => dayNames[d])
						.join(',')})` + (t.description ? ` — ${t.description}` : '')
			)
			.join('\n');
	}
};
