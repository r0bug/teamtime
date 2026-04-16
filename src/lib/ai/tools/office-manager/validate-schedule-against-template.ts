// Validate Schedule Against Template Tool
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRange } from '$lib/server/services/schedule-template-service';
import { isValidUUID } from '../utils/validation';
import { toPacificDateString } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:validate-schedule-against-template');

interface ValidateScheduleParams {
	templateId?: string; // defaults to active default template if omitted
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
}

interface ValidateScheduleResult {
	success: boolean;
	templateId?: string;
	driftPercent?: number;
	missingCount?: number;
	extraCount?: number;
	modifiedCount?: number;
	matchingCount?: number;
	samples?: {
		missing: Array<{ date: string; userId: string; startTime: string; endTime: string }>;
		extra: Array<{ date: string; userId: string; startTime: string; endTime: string }>;
		modified: Array<{ date: string; userId: string; diffs: string[] }>;
	};
	error?: string;
}

export const validateScheduleAgainstTemplateTool: AITool<
	ValidateScheduleParams,
	ValidateScheduleResult
> = {
	name: 'validate_schedule_against_template',
	description:
		"Check whether the actual scheduled shifts in a date range match a template. Reports drift: missing shifts (template expects but no shift exists), extra shifts (shift exists that template doesn't expect), and modified shifts (exists but end time or location differs). If templateId is omitted, the active default template is used.",
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			templateId: {
				type: 'string',
				description: 'Optional template UUID. If omitted, uses the active default.'
			},
			startDate: { type: 'string', description: 'YYYY-MM-DD inclusive start' },
			endDate: { type: 'string', description: 'YYYY-MM-DD inclusive end' }
		},
		required: ['startDate', 'endDate']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ValidateScheduleParams) {
		if (params.templateId && !isValidUUID(params.templateId)) {
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
		params: ValidateScheduleParams,
		_context: ToolExecutionContext
	): Promise<ValidateScheduleResult> {
		try {
			const report = await validateRange(params);
			return {
				success: true,
				templateId: report.templateId,
				driftPercent: report.summary.driftPercent,
				missingCount: report.summary.missingCount,
				extraCount: report.summary.extraCount,
				modifiedCount: report.summary.modifiedCount,
				matchingCount: report.summary.matchingCount,
				samples: {
					missing: report.missing.slice(0, 5).map((m) => ({
						date: m.date,
						userId: m.userId,
						startTime: m.startTime,
						endTime: m.endTime
					})),
					extra: report.extra.slice(0, 5).map((e) => ({
						date: toPacificDateString(e.startTime),
						userId: e.userId,
						startTime: e.startTime.toISOString(),
						endTime: e.endTime.toISOString()
					})),
					modified: report.modified.slice(0, 5).map((m) => ({
						date: m.slot.date,
						userId: m.slot.userId,
						diffs: m.diffs
					}))
				}
			};
		} catch (err) {
			log.error({ err, params }, 'validate_schedule_against_template failed');
			return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
	},

	formatResult(result: ValidateScheduleResult): string {
		if (!result.success) return `Failed to validate: ${result.error}`;
		let msg = `Drift: ${result.driftPercent}% — `;
		msg += `${result.missingCount} missing, ${result.extraCount} extra, ${result.modifiedCount} modified, ${result.matchingCount} matching.`;
		if (result.samples) {
			if (result.samples.missing.length > 0) {
				msg +=
					'\nMissing samples: ' +
					result.samples.missing
						.map((s) => `${s.date} ${s.startTime} (user ${s.userId.slice(0, 8)})`)
						.join(', ');
			}
			if (result.samples.modified.length > 0) {
				msg +=
					'\nModified samples: ' +
					result.samples.modified
						.map((s) => `${s.date} (user ${s.userId.slice(0, 8)}): ${s.diffs.join('; ')}`)
						.join(', ');
			}
		}
		return msg;
	}
};
