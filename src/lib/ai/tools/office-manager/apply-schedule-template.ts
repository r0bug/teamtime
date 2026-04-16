// Apply Schedule Template Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import {
	commitGapFillOnly,
	planApplication
} from '$lib/server/services/schedule-template-service';
import { isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:apply-schedule-template');

interface ApplyScheduleTemplateParams {
	templateId: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	// Agent mode defaults to 'fill_gaps_only' — there's no HITL conflict prompt at agent time.
	// Conflicts are reported in the response for a human to resolve manually.
	mode?: 'fill_gaps_only';
}

interface ApplyScheduleTemplateResult {
	success: boolean;
	created?: number;
	conflicts?: number;
	alreadyMatching?: number;
	conflictDetails?: Array<{ date: string; userId: string; startTime: string; note: string }>;
	error?: string;
}

export const applyScheduleTemplateTool: AITool<
	ApplyScheduleTemplateParams,
	ApplyScheduleTemplateResult
> = {
	name: 'apply_schedule_template',
	description:
		"Apply a saved schedule template to a date range — creates shifts for each day/user the template covers. ALWAYS uses gap-fill mode: will not overwrite existing shifts; conflicts are reported for human review. Prefer this over building a week shift-by-shift with create_schedule. Use list_schedule_templates to find the templateId.",
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			templateId: { type: 'string', description: 'UUID of the template to apply' },
			startDate: { type: 'string', description: 'YYYY-MM-DD inclusive start' },
			endDate: { type: 'string', description: 'YYYY-MM-DD inclusive end' }
		},
		required: ['templateId', 'startDate', 'endDate']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: ApplyScheduleTemplateParams): string {
		return `Apply schedule template to ${params.startDate} through ${params.endDate}? Existing shifts will NOT be overwritten; any conflicts will be reported for manual review.`;
	},

	validate(params: ApplyScheduleTemplateParams) {
		if (!isValidUUID(params.templateId)) {
			return { valid: false, error: 'templateId must be a UUID' };
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
			return { valid: false, error: 'startDate must be YYYY-MM-DD' };
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
			return { valid: false, error: 'endDate must be YYYY-MM-DD' };
		}
		return { valid: true };
	},

	async execute(
		params: ApplyScheduleTemplateParams,
		context: ToolExecutionContext
	): Promise<ApplyScheduleTemplateResult> {
		if (context.dryRun) {
			try {
				const plan = await planApplication(params);
				return {
					success: true,
					created: plan.toCreate.length,
					conflicts: plan.conflicts.length,
					alreadyMatching: plan.alreadyMatching.length,
					error: 'Dry run — nothing committed'
				};
			} catch (err) {
				return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
			}
		}
		try {
			const plan = await planApplication(params);
			const result = await commitGapFillOnly(plan, context.userId ?? null);
			const conflictDetails = plan.conflicts.slice(0, 10).map((c) => ({
				date: c.slot.date,
				userId: c.slot.userId,
				startTime: c.slot.startTime,
				note: `existing shifts at ${c.existing.map((e) => e.id.slice(0, 8)).join(', ')}`
			}));
			return {
				success: true,
				created: result.created,
				conflicts: plan.conflicts.length,
				alreadyMatching: plan.alreadyMatching.length,
				conflictDetails: plan.conflicts.length > 0 ? conflictDetails : undefined
			};
		} catch (err) {
			log.error({ err, params }, 'apply_schedule_template failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: ApplyScheduleTemplateResult): string {
		if (!result.success) return `Failed to apply template: ${result.error}`;
		let msg = `Applied template: ${result.created ?? 0} shifts created, ${result.alreadyMatching ?? 0} already matched template.`;
		if (result.conflicts && result.conflicts > 0) {
			msg += ` ${result.conflicts} conflicts skipped — requires manual review.`;
			if (result.conflictDetails && result.conflictDetails.length > 0) {
				msg += `\nFirst ${result.conflictDetails.length} conflict(s):\n`;
				msg += result.conflictDetails
					.map((c) => `  - ${c.date} ${c.startTime} (user ${c.userId.slice(0, 8)}): ${c.note}`)
					.join('\n');
			}
		}
		return msg;
	}
};
