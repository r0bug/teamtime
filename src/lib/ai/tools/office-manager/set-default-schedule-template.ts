// Set Default Schedule Template Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import {
	setDefaultTemplate,
	getTemplate
} from '$lib/server/services/schedule-template-service';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:set-default-schedule-template');

interface SetDefaultScheduleTemplateParams {
	templateId: string;
}

interface SetDefaultScheduleTemplateResult {
	success: boolean;
	templateId?: string;
	name?: string;
	error?: string;
}

export const setDefaultScheduleTemplateTool: AITool<
	SetDefaultScheduleTemplateParams,
	SetDefaultScheduleTemplateResult
> = {
	name: 'set_default_schedule_template',
	description:
		'Mark a schedule template as the active default. The default template is used by the auto-apply cron (which populates future weeks daily). Only one default exists at a time — setting a new default automatically unsets the previous one.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			templateId: { type: 'string', description: 'UUID of the template to make default' }
		},
		required: ['templateId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: SetDefaultScheduleTemplateParams): string {
		return `Set template ${params.templateId.slice(0, 8)}... as the active default? The cron will use this template to populate future weeks.`;
	},

	validate(params: SetDefaultScheduleTemplateParams) {
		if (!isValidUUID(params.templateId)) {
			return { valid: false, error: 'templateId must be a UUID' };
		}
		return { valid: true };
	},

	async execute(
		params: SetDefaultScheduleTemplateParams,
		context: ToolExecutionContext
	): Promise<SetDefaultScheduleTemplateResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run — default would be changed' };
		}
		try {
			await setDefaultTemplate(params.templateId);
			const tpl = await getTemplate(params.templateId);
			return {
				success: true,
				templateId: params.templateId,
				name: tpl?.name
			};
		} catch (err) {
			log.error({ err, params }, 'set_default_schedule_template failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: SetDefaultScheduleTemplateResult): string {
		if (!result.success) return `Failed to set default: ${result.error}`;
		return `Set "${result.name}" as active default schedule template.`;
	}
};
