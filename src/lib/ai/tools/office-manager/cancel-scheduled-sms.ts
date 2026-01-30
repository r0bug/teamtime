// Cancel Scheduled SMS Tool - Cancel a pending scheduled SMS
import { cancelJob, getJob } from '$lib/server/jobs';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:cancel-scheduled-sms');

interface CancelScheduledSMSParams {
	jobId: string;
}

interface CancelScheduledSMSResult {
	success: boolean;
	cancelled: boolean;
	message?: string;
	error?: string;
}

export const cancelScheduledSMSTool: AITool<CancelScheduledSMSParams, CancelScheduledSMSResult> = {
	name: 'cancel_scheduled_sms',
	description:
		'Cancel a pending scheduled SMS by its job ID. Only pending SMS can be cancelled. Use view_scheduled_sms first to get the job ID.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			jobId: {
				type: 'string',
				description: 'The job ID of the scheduled SMS to cancel (from view_scheduled_sms)'
			}
		},
		required: ['jobId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: CancelScheduledSMSParams): string {
		return `Cancel scheduled SMS with Job ID: ${params.jobId}?`;
	},

	validate(params: CancelScheduledSMSParams) {
		if (!params.jobId || params.jobId.trim().length === 0) {
			return { valid: false, error: 'jobId is required' };
		}
		// Basic UUID format check
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(params.jobId)) {
			return { valid: false, error: 'Invalid jobId format (must be UUID)' };
		}
		return { valid: true };
	},

	async execute(
		params: CancelScheduledSMSParams,
		context: ToolExecutionContext
	): Promise<CancelScheduledSMSResult> {
		if (context.dryRun) {
			return { success: true, cancelled: false, message: 'Dry run - SMS would be cancelled' };
		}

		try {
			// Verify it's a scheduled_sms job
			const job = await getJob(params.jobId);

			if (!job) {
				return { success: false, cancelled: false, error: 'Job not found' };
			}

			if (job.type !== 'scheduled_sms') {
				return { success: false, cancelled: false, error: 'Job is not a scheduled SMS' };
			}

			if (job.status !== 'pending') {
				return {
					success: false,
					cancelled: false,
					error: `Cannot cancel - job status is '${job.status}'`
				};
			}

			const cancelled = await cancelJob(params.jobId);

			if (cancelled) {
				log.info({ jobId: params.jobId }, 'Scheduled SMS cancelled');
				return {
					success: true,
					cancelled: true,
					message: `SMS scheduled for ${job.runAt.toISOString()} has been cancelled`
				};
			} else {
				return {
					success: false,
					cancelled: false,
					error: 'Failed to cancel - job may have already been processed'
				};
			}
		} catch (error) {
			log.error({ error, jobId: params.jobId }, 'Failed to cancel scheduled SMS');
			return {
				success: false,
				cancelled: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CancelScheduledSMSResult): string {
		if (result.success && result.cancelled) {
			return `Scheduled SMS cancelled. ${result.message || ''}`;
		}
		if (result.message) {
			return result.message;
		}
		return `Failed to cancel: ${result.error}`;
	}
};
