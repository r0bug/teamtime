// View Scheduled SMS Tool - List pending scheduled SMS jobs
import { db } from '$lib/server/db';
import { jobs, users } from '$lib/server/db/schema';
import { eq, and, gte, or, desc } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:view-scheduled-sms');

interface ViewScheduledSMSParams {
	includeCompleted?: boolean;
	limit?: number;
}

interface ScheduledSMSEntry {
	jobId: string;
	status: string;
	scheduledFor: string;
	recipientType: 'user' | 'phone' | 'all_staff';
	recipientName?: string;
	message: string;
	scheduledBy: string;
	createdAt: string;
}

interface ViewScheduledSMSResult {
	success: boolean;
	scheduled: ScheduledSMSEntry[];
	error?: string;
}

export const viewScheduledSMSTool: AITool<ViewScheduledSMSParams, ViewScheduledSMSResult> = {
	name: 'view_scheduled_sms',
	description:
		'View pending and recently sent scheduled SMS messages. Shows job ID, status, scheduled time, recipient, and message preview.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			includeCompleted: {
				type: 'boolean',
				description: 'Include completed SMS from last 24 hours (default: false)'
			},
			limit: {
				type: 'number',
				description: 'Maximum results to return (default: 20, max: 50)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ViewScheduledSMSParams) {
		if (params.limit !== undefined && (params.limit < 1 || params.limit > 50)) {
			return { valid: false, error: 'limit must be between 1 and 50' };
		}
		return { valid: true };
	},

	async execute(
		params: ViewScheduledSMSParams,
		context: ToolExecutionContext
	): Promise<ViewScheduledSMSResult> {
		try {
			const limit = Math.min(params.limit || 20, 50);

			let scheduledJobs;

			if (params.includeCompleted) {
				// Include pending + completed/failed in last 24h
				const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
				scheduledJobs = await db
					.select()
					.from(jobs)
					.where(
						and(
							eq(jobs.type, 'scheduled_sms'),
							or(eq(jobs.status, 'pending'), gte(jobs.completedAt, yesterday))
						)
					)
					.orderBy(desc(jobs.runAt))
					.limit(limit);
			} else {
				// Just pending jobs
				scheduledJobs = await db
					.select()
					.from(jobs)
					.where(and(eq(jobs.type, 'scheduled_sms'), eq(jobs.status, 'pending')))
					.orderBy(jobs.runAt)
					.limit(limit);
			}

			// Enrich with user names
			const enriched: ScheduledSMSEntry[] = [];

			for (const job of scheduledJobs) {
				const payload = job.payload as {
					toUserId?: string;
					toPhone?: string;
					toAllStaff?: boolean;
					message: string;
					scheduledBy: string;
				};

				let recipientType: 'user' | 'phone' | 'all_staff';
				let recipientName: string | undefined;

				if (payload.toAllStaff) {
					recipientType = 'all_staff';
					recipientName = 'All Staff';
				} else if (payload.toUserId) {
					recipientType = 'user';
					const [user] = await db
						.select({ name: users.name })
						.from(users)
						.where(eq(users.id, payload.toUserId))
						.limit(1);
					recipientName = user?.name || 'Unknown User';
				} else {
					recipientType = 'phone';
					recipientName = payload.toPhone;
				}

				enriched.push({
					jobId: job.id,
					status: job.status,
					scheduledFor: job.runAt.toISOString(),
					recipientType,
					recipientName,
					message:
						payload.message.substring(0, 100) + (payload.message.length > 100 ? '...' : ''),
					scheduledBy: payload.scheduledBy,
					createdAt: job.createdAt.toISOString()
				});
			}

			return { success: true, scheduled: enriched };
		} catch (error) {
			log.error({ error }, 'Failed to view scheduled SMS');
			return {
				success: false,
				scheduled: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ViewScheduledSMSResult): string {
		if (!result.success) {
			return `Error: ${result.error}`;
		}
		if (result.scheduled.length === 0) {
			return 'No scheduled SMS messages found.';
		}

		const lines = ['**Scheduled SMS Messages:**', ''];
		for (const sms of result.scheduled) {
			const status =
				sms.status === 'pending' ? '⏳' : sms.status === 'completed' ? '✅' : '❌';
			lines.push(`${status} **${sms.recipientName || 'Unknown'}** - ${sms.scheduledFor}`);
			lines.push(`   Message: "${sms.message}"`);
			lines.push(`   Job ID: ${sms.jobId}`);
			lines.push('');
		}
		return lines.join('\n');
	}
};
