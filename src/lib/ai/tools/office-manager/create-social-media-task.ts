// Create Social Media Task Tool - Assign social media metrics tasks to users
import { db, tasks, users, socialMediaConfigs, socialMediaTaskLinks } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRequiredUserId, isValidUUID } from '../utils/validation';

const log = createLogger('ai:tools:create-social-media-task');

interface CreateSocialMediaTaskParams {
	userId: string;
	configId?: string;
	postUrl?: string;
	dueAt?: string;
	priority?: 'low' | 'medium' | 'high' | 'urgent';
}

interface CreateSocialMediaTaskResult {
	success: boolean;
	taskId?: string;
	userName?: string;
	configName?: string;
	platform?: string;
	dueAt?: string;
	error?: string;
}

export const createSocialMediaTaskTool: AITool<CreateSocialMediaTaskParams, CreateSocialMediaTaskResult> = {
	name: 'create_social_media_task',
	description: 'Create a social media metrics tracking task. Used to collect engagement metrics like likes, comments, shares, views for posts on Instagram, Facebook, TikTok, YouTube, or Twitter.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user who should complete the social media metrics task'
			},
			configId: {
				type: 'string',
				description: 'Optional: specific social media config to use (for specific platform/metrics)'
			},
			postUrl: {
				type: 'string',
				description: 'Optional: URL of the social media post to track'
			},
			dueAt: {
				type: 'string',
				description: 'When the task is due (ISO datetime). Defaults to 24 hours from now.'
			},
			priority: {
				type: 'string',
				enum: ['low', 'medium', 'high', 'urgent'],
				description: 'Task priority level'
			}
		},
		required: ['userId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		perUser: 60,
		global: 10
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: CreateSocialMediaTaskParams): string {
		let msg = `Create social media metrics task?\n\n`;
		msg += `Assigned to: User ${params.userId.slice(0, 8)}...`;
		if (params.postUrl) {
			msg += `\nPost URL: ${params.postUrl}`;
		}
		if (params.dueAt) {
			msg += `\nDue: ${new Date(params.dueAt).toLocaleString()}`;
		}
		return msg;
	},

	validate(params: CreateSocialMediaTaskParams) {
		// Validate userId format (required)
		const userIdValidation = validateRequiredUserId(params.userId, 'userId');
		if (!userIdValidation.valid) {
			return userIdValidation;
		}
		// Validate configId format if provided (optional)
		if (params.configId && !isValidUUID(params.configId)) {
			return { valid: false, error: `Invalid configId format: "${params.configId}". Expected a UUID.` };
		}
		if (params.postUrl && !params.postUrl.startsWith('http')) {
			return { valid: false, error: 'Post URL must be a valid URL' };
		}
		if (params.dueAt) {
			const due = new Date(params.dueAt);
			if (isNaN(due.getTime())) {
				return { valid: false, error: 'Invalid due date format' };
			}
		}
		return { valid: true };
	},

	async execute(params: CreateSocialMediaTaskParams, context: ToolExecutionContext): Promise<CreateSocialMediaTaskResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - social media task would be created'
			};
		}

		try {
			// Verify user exists and is active
			const user = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, params.userId))
				.limit(1);

			if (user.length === 0) {
				return { success: false, error: 'User not found' };
			}
			if (!user[0].isActive) {
				return { success: false, error: 'User is not active' };
			}

			// Get config - either specified or first active one
			let config;
			if (params.configId) {
				const [c] = await db
					.select()
					.from(socialMediaConfigs)
					.where(and(eq(socialMediaConfigs.id, params.configId), eq(socialMediaConfigs.isActive, true)))
					.limit(1);
				config = c;
			} else {
				const [c] = await db
					.select()
					.from(socialMediaConfigs)
					.where(eq(socialMediaConfigs.isActive, true))
					.limit(1);
				config = c;
			}

			if (!config) {
				return { success: false, error: 'No active social media config found. Please create one first.' };
			}

			// Calculate due date (default 24 hours)
			const dueAt = params.dueAt
				? new Date(params.dueAt)
				: new Date(Date.now() + 24 * 60 * 60 * 1000);

			// Create the task
			const [task] = await db
				.insert(tasks)
				.values({
					title: `Social Media Metrics - ${config.name}`,
					description: `Track engagement metrics for ${config.platform} post.${params.postUrl ? ` Post: ${params.postUrl}` : ''}`,
					assignedTo: params.userId,
					priority: params.priority || 'medium',
					dueAt,
					status: 'not_started',
					source: 'manual',
					photoRequired: config.requireScreenshot,
					notesRequired: false
				})
				.returning({ id: tasks.id });

			// Create link to config
			await db
				.insert(socialMediaTaskLinks)
				.values({
					taskId: task.id,
					configId: config.id,
					postUrl: params.postUrl || null
				});

			return {
				success: true,
				taskId: task.id,
				userName: user[0].name,
				configName: config.name,
				platform: config.platform,
				dueAt: dueAt.toISOString()
			};
		} catch (error) {
			log.error({ error }, 'Create social media task tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreateSocialMediaTaskResult): string {
		if (result.success) {
			return `Social media task "${result.configName}" (${result.platform}) created for ${result.userName}`;
		}
		return `Failed to create social media task: ${result.error}`;
	}
};
