// Save Week as Schedule Template Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { saveWeekAsTemplate } from '$lib/server/services/schedule-template-service';

const log = createLogger('ai:tools:save-week-as-template');

interface SaveWeekAsTemplateParams {
	weekStartDate: string; // YYYY-MM-DD
	name: string;
	description?: string;
	setAsDefault?: boolean;
}

interface SaveWeekAsTemplateResult {
	success: boolean;
	templateId?: string;
	name?: string;
	shiftCount?: number;
	isDefault?: boolean;
	error?: string;
}

export const saveWeekAsTemplateTool: AITool<
	SaveWeekAsTemplateParams,
	SaveWeekAsTemplateResult
> = {
	name: 'save_week_as_template',
	description:
		'Capture an existing week of shifts as a new reusable schedule template. Supply a date within the week (weeks start Sunday Pacific). The resulting template mirrors every shift in that week, keyed by day-of-week + wall-clock time. Optionally mark it as the active default.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			weekStartDate: {
				type: 'string',
				description: 'Any YYYY-MM-DD date within the week to capture (Sunday = week start)'
			},
			name: { type: 'string', description: 'Template name' },
			description: { type: 'string' },
			setAsDefault: { type: 'boolean' }
		},
		required: ['weekStartDate', 'name']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: SaveWeekAsTemplateParams): string {
		return (
			`Save the week containing ${params.weekStartDate} as schedule template "${params.name}"?` +
			(params.setAsDefault ? ' (will be set as default)' : '')
		);
	},

	validate(params: SaveWeekAsTemplateParams) {
		if (!params.name?.trim()) return { valid: false, error: 'name is required' };
		if (!/^\d{4}-\d{2}-\d{2}$/.test(params.weekStartDate)) {
			return { valid: false, error: 'weekStartDate must be YYYY-MM-DD' };
		}
		return { valid: true };
	},

	async execute(
		params: SaveWeekAsTemplateParams,
		context: ToolExecutionContext
	): Promise<SaveWeekAsTemplateResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run — template would be captured' };
		}
		try {
			const tpl = await saveWeekAsTemplate(new Date(params.weekStartDate + 'T12:00:00-08:00'), {
				name: params.name.trim(),
				description: params.description ?? null,
				setAsDefault: params.setAsDefault ?? false,
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
			log.error({ err, params }, 'save_week_as_template failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: SaveWeekAsTemplateResult): string {
		if (!result.success) return `Failed to save week as template: ${result.error}`;
		return (
			`Saved week as template "${result.name}" (${result.shiftCount} shifts).` +
			(result.isDefault ? ' Marked as active default.' : '')
		);
	}
};
