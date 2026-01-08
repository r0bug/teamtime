// Schedule SMS Tool - Schedule SMS for future delivery
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createJob } from '$lib/server/jobs';
import { formatPhoneToE164, isValidPhoneNumber } from '$lib/server/twilio';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';

const log = createLogger('ai:tools:schedule-sms');

interface ScheduleSMSParams {
	toUserId?: string;
	toPhone?: string;
	toAllStaff?: boolean;
	message: string;
	// Scheduling options (mutually exclusive)
	delayMinutes?: number;
	delayHours?: number;
	scheduledDateTime?: string;
}

interface ScheduleSMSResult {
	success: boolean;
	jobId?: string;
	scheduledFor?: string;
	recipientDescription?: string;
	error?: string;
}

export const scheduleSMSTool: AITool<ScheduleSMSParams, ScheduleSMSResult> = {
	name: 'schedule_sms',
	description:
		'Schedule an SMS to be sent at a future time. Useful for reminders, shift notifications, or time-sensitive alerts. Can schedule by delay (minutes/hours) or specific datetime. Maximum 7 days in advance.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			toUserId: {
				type: 'string',
				description: 'User ID to send SMS to (uses their stored phone number)'
			},
			toPhone: {
				type: 'string',
				description: 'Direct phone number in E.164 format (e.g., +15551234567)'
			},
			toAllStaff: {
				type: 'boolean',
				description: 'Send to all active staff members with phone numbers'
			},
			message: {
				type: 'string',
				description: 'The SMS message content (keep under 160 chars for best delivery)'
			},
			delayMinutes: {
				type: 'number',
				description: 'Send in X minutes from now (e.g., 30 for half hour)'
			},
			delayHours: {
				type: 'number',
				description: 'Send in X hours from now (e.g., 2 for two hours)'
			},
			scheduledDateTime: {
				type: 'string',
				description: 'Specific date/time to send (ISO 8601, e.g., "2024-01-15T09:00:00")'
			}
		},
		required: ['message']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		perUser: 2, // Can schedule SMS for same user every 2 min
		global: 1
	},
	rateLimit: {
		maxPerHour: 30 // Higher limit since scheduling is less impactful
	},

	getConfirmationMessage(params: ScheduleSMSParams): string {
		const timeDesc = params.scheduledDateTime
			? `at ${params.scheduledDateTime}`
			: params.delayHours
				? `in ${params.delayHours} hour(s)`
				: `in ${params.delayMinutes || 0} minute(s)`;

		const recipientDesc = params.toAllStaff
			? 'ALL STAFF'
			: params.toUserId
				? 'the specified user'
				: params.toPhone;

		return `Schedule SMS to ${recipientDesc} ${timeDesc}?\n\nMessage: "${params.message}"`;
	},

	validate(params: ScheduleSMSParams) {
		// Message validation
		if (!params.message || params.message.trim().length < 2) {
			return { valid: false, error: 'SMS message is required' };
		}
		if (params.message.length > 1600) {
			return { valid: false, error: 'SMS message too long (max 1600 chars)' };
		}

		// Recipient validation
		if (!params.toUserId && !params.toPhone && !params.toAllStaff) {
			return { valid: false, error: 'Either toUserId, toPhone, or toAllStaff is required' };
		}
		const targetCount = [params.toUserId, params.toPhone, params.toAllStaff].filter(Boolean).length;
		if (targetCount > 1) {
			return { valid: false, error: 'Only one recipient type can be specified' };
		}

		// User ID validation
		if (params.toUserId) {
			const validation = validateUserId(params.toUserId, 'toUserId');
			if (!validation.valid) return validation;
		}

		// Phone validation
		if (params.toPhone) {
			const formatted = formatPhoneToE164(params.toPhone);
			if (!formatted) {
				return { valid: false, error: 'Invalid phone number format. Use E.164 format (e.g., +15551234567)' };
			}
		}

		// Schedule time validation
		const scheduleOptions = [params.delayMinutes, params.delayHours, params.scheduledDateTime].filter(
			(v) => v !== undefined
		);
		if (scheduleOptions.length === 0) {
			return { valid: false, error: 'Schedule time required: use delayMinutes, delayHours, or scheduledDateTime' };
		}
		if (scheduleOptions.length > 1) {
			return { valid: false, error: 'Only one schedule option allowed' };
		}

		if (params.delayMinutes !== undefined && (params.delayMinutes < 1 || params.delayMinutes > 10080)) {
			return { valid: false, error: 'delayMinutes must be between 1 and 10080 (7 days)' };
		}
		if (params.delayHours !== undefined && (params.delayHours < 1 || params.delayHours > 168)) {
			return { valid: false, error: 'delayHours must be between 1 and 168 (7 days)' };
		}
		if (params.scheduledDateTime) {
			const scheduled = new Date(params.scheduledDateTime);
			if (isNaN(scheduled.getTime())) {
				return { valid: false, error: 'Invalid datetime format. Use ISO 8601 (e.g., "2024-01-15T09:00:00")' };
			}
			const now = new Date();
			if (scheduled <= now) {
				return { valid: false, error: 'Scheduled time must be in the future' };
			}
			const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
			if (scheduled > maxFuture) {
				return { valid: false, error: 'Cannot schedule more than 7 days in advance' };
			}
		}

		return { valid: true };
	},

	async execute(params: ScheduleSMSParams, context: ToolExecutionContext): Promise<ScheduleSMSResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run - SMS would be scheduled' };
		}

		try {
			// Calculate runAt time
			let runAt: Date;
			if (params.scheduledDateTime) {
				runAt = new Date(params.scheduledDateTime);
			} else if (params.delayHours) {
				runAt = new Date(Date.now() + params.delayHours * 60 * 60 * 1000);
			} else {
				runAt = new Date(Date.now() + (params.delayMinutes || 1) * 60 * 1000);
			}

			// Determine recipient description for confirmation
			let recipientDescription: string;
			if (params.toAllStaff) {
				recipientDescription = 'all staff';
			} else if (params.toUserId) {
				const [user] = await db
					.select({ name: users.name })
					.from(users)
					.where(eq(users.id, params.toUserId))
					.limit(1);
				recipientDescription = user?.name || 'unknown user';
			} else {
				recipientDescription = params.toPhone || 'unknown';
			}

			// Create the job
			const job = await createJob(
				'scheduled_sms',
				{
					toUserId: params.toUserId,
					toPhone: params.toPhone,
					toAllStaff: params.toAllStaff,
					message: params.message,
					scheduledBy: context.userId || `ai:${context.agent}`,
					aiRunId: context.runId
				},
				{
					runAt,
					maxAttempts: 3,
					priority: 5 // Higher priority for time-sensitive SMS
				}
			);

			log.info('Scheduled SMS job created', {
				jobId: job.id,
				runAt: runAt.toISOString(),
				recipient: recipientDescription
			});

			return {
				success: true,
				jobId: job.id,
				scheduledFor: runAt.toISOString(),
				recipientDescription
			};
		} catch (error) {
			log.error('Failed to schedule SMS', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ScheduleSMSResult): string {
		if (result.success) {
			return `SMS scheduled for ${result.recipientDescription} at ${result.scheduledFor} (Job ID: ${result.jobId})`;
		}
		return `Failed to schedule SMS: ${result.error}`;
	}
};
