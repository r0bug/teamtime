// Create Schedule Template Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import {
	createTemplate,
	type TemplateShiftInput
} from '$lib/server/services/schedule-template-service';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:create-schedule-template');

interface CreateScheduleTemplateParams {
	name: string;
	description?: string;
	setAsDefault?: boolean;
	shifts: TemplateShiftInput[];
}

interface CreateScheduleTemplateResult {
	success: boolean;
	templateId?: string;
	name?: string;
	shiftCount?: number;
	isDefault?: boolean;
	error?: string;
}

export const createScheduleTemplateTool: AITool<
	CreateScheduleTemplateParams,
	CreateScheduleTemplateResult
> = {
	name: 'create_schedule_template',
	description:
		'Create a new weekly schedule template — a saved pattern of recurring shifts that can be applied to any future date range. Each shift specifies a day of the week (0=Sunday, 6=Saturday), start/end times (HH:MM 24h), and user. Optionally set this new template as the active default. IMPORTANT: userId must be a UUID from the People context.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Template name, e.g. "Default Weekly", "Summer"' },
			description: { type: 'string' },
			setAsDefault: {
				type: 'boolean',
				description:
					'If true, mark this template as the active default (used by auto-apply cron). Only one default may exist.'
			},
			shifts: {
				type: 'array',
				description:
					'Array of recurring shifts. Each item defines a shift that should exist every week.',
				items: {
					type: 'object',
					properties: {
						dayOfWeek: { type: 'number', description: '0=Sunday ... 6=Saturday' },
						startTime: { type: 'string', description: 'HH:MM 24h' },
						endTime: { type: 'string', description: 'HH:MM 24h' },
						userId: { type: 'string', description: 'UUID of assigned user' },
						locationId: { type: 'string', description: 'Optional location UUID' },
						notes: { type: 'string' }
					},
					required: ['dayOfWeek', 'startTime', 'endTime', 'userId']
				}
			}
		},
		required: ['name', 'shifts']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: CreateScheduleTemplateParams): string {
		const dayCount = new Set(params.shifts.map((s) => s.dayOfWeek)).size;
		const userCount = new Set(params.shifts.map((s) => s.userId)).size;
		let msg = `Create schedule template "${params.name}" with ${params.shifts.length} shifts across ${dayCount} day(s) for ${userCount} user(s).`;
		if (params.setAsDefault) msg += '\n\n★ This will become the active default template (used by auto-apply cron).';
		return msg;
	},

	validate(params: CreateScheduleTemplateParams) {
		if (!params.name?.trim()) return { valid: false, error: 'name is required' };
		if (!Array.isArray(params.shifts) || params.shifts.length === 0) {
			return { valid: false, error: 'shifts array cannot be empty' };
		}
		const timeRe = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
		for (let i = 0; i < params.shifts.length; i++) {
			const s = params.shifts[i];
			if (s.dayOfWeek < 0 || s.dayOfWeek > 6) {
				return { valid: false, error: `shifts[${i}]: dayOfWeek must be 0-6` };
			}
			if (!timeRe.test(s.startTime) || !timeRe.test(s.endTime)) {
				return { valid: false, error: `shifts[${i}]: times must be HH:MM 24h format` };
			}
			if (!isValidUUID(s.userId)) {
				return { valid: false, error: `shifts[${i}]: userId must be a UUID` };
			}
			if (s.locationId && !isValidUUID(s.locationId)) {
				return { valid: false, error: `shifts[${i}]: locationId must be a UUID` };
			}
		}
		return { valid: true };
	},

	async execute(
		params: CreateScheduleTemplateParams,
		context: ToolExecutionContext
	): Promise<CreateScheduleTemplateResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run — template would be created' };
		}
		try {
			const tpl = await createTemplate({
				name: params.name.trim(),
				description: params.description ?? null,
				setAsDefault: params.setAsDefault ?? false,
				shifts: params.shifts,
				createdBy: context.userId ?? null
			});
			return {
				success: true,
				templateId: tpl.id,
				name: tpl.name,
				shiftCount: tpl.shifts.length,
				isDefault: tpl.isDefault
			};
		} catch (err) {
			log.error({ err }, 'create_schedule_template failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: CreateScheduleTemplateResult): string {
		if (!result.success) return `Failed to create template: ${result.error}`;
		return (
			`Created template "${result.name}" with ${result.shiftCount} shifts.` +
			(result.isDefault ? ' Marked as active default.' : '')
		);
	}
};
