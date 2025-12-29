// Give Shoutout Tool - Allows AI to create public recognition shoutouts
import { db, users, awardTypes as awardTypesTable } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import {
	createShoutout,
	getAwardTypes,
	type ShoutoutCategory
} from '$lib/server/services/shoutout-service';

const log = createLogger('ai:tools:give-shoutout');

interface GiveShoutoutParams {
	userId: string;
	title: string;
	category: ShoutoutCategory;
	description?: string;
	awardTypeName?: string;
	announceToTeam?: boolean;
}

interface GiveShoutoutResult {
	success: boolean;
	shoutoutId?: string;
	userName?: string;
	pointsAwarded?: number;
	error?: string;
}

export const giveShoutoutTool: AITool<GiveShoutoutParams, GiveShoutoutResult> = {
	name: 'give_shoutout',
	description: 'Give a public shoutout to recognize a team member for their contributions. Shoutouts from the Office Manager are auto-approved and award points immediately. Use this for notable achievements, helpful behaviors, or milestone celebrations.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user ID to recognize'
			},
			title: {
				type: 'string',
				description: 'Short recognition message (e.g., "Great teamwork on the estate sale today!")'
			},
			category: {
				type: 'string',
				enum: ['teamwork', 'quality', 'initiative', 'customer', 'mentoring', 'innovation', 'reliability', 'general'],
				description: 'Category of recognition'
			},
			description: {
				type: 'string',
				description: 'Optional longer description of the achievement'
			},
			awardTypeName: {
				type: 'string',
				description: 'Name of award type to use (e.g., "Team Player", "Above & Beyond"). Uses matching award type points.'
			},
			announceToTeam: {
				type: 'boolean',
				description: 'If true, also sends a broadcast message to all staff (default: false)'
			}
		},
		required: ['userId', 'title', 'category']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 120, // Don't shoutout same user more than once every 2 hours
		global: 15    // Global cooldown of 15 minutes
	},
	rateLimit: {
		maxPerHour: 5
	},

	validate(params: GiveShoutoutParams) {
		// Validate userId
		const userValidation = validateUserId(params.userId, 'userId');
		if (!userValidation.valid) return userValidation;

		// Validate title
		if (!params.title || params.title.trim().length < 5) {
			return { valid: false, error: 'Title must be at least 5 characters' };
		}
		if (params.title.length > 100) {
			return { valid: false, error: 'Title must be under 100 characters' };
		}

		// Validate category
		const validCategories: ShoutoutCategory[] = [
			'teamwork', 'quality', 'initiative', 'customer',
			'mentoring', 'innovation', 'reliability', 'general'
		];
		if (!validCategories.includes(params.category)) {
			return { valid: false, error: `Invalid category. Must be one of: ${validCategories.join(', ')}` };
		}

		// Validate description if provided
		if (params.description && params.description.length > 500) {
			return { valid: false, error: 'Description must be under 500 characters' };
		}

		return { valid: true };
	},

	async execute(params: GiveShoutoutParams, context: ToolExecutionContext): Promise<GiveShoutoutResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - shoutout would be created'
			};
		}

		try {
			// Get user info
			const [user] = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, params.userId));

			if (!user) {
				return { success: false, error: 'User not found' };
			}
			if (!user.isActive) {
				return { success: false, error: 'Cannot give shoutout to inactive user' };
			}

			// Find award type if specified
			let awardTypeId: string | undefined;
			if (params.awardTypeName) {
				const types = await getAwardTypes(true);
				const matchingType = types.find(t =>
					t.name.toLowerCase() === params.awardTypeName!.toLowerCase()
				);
				if (matchingType) {
					awardTypeId = matchingType.id;
				}
			}

			// If no award type specified or found, try to match by category
			if (!awardTypeId) {
				const types = await getAwardTypes(true);
				const categoryMatch = types.find(t => t.category === params.category);
				if (categoryMatch) {
					awardTypeId = categoryMatch.id;
				}
			}

			// Create the shoutout
			const shoutout = await createShoutout({
				recipientId: params.userId,
				nominatorId: null, // null indicates AI/system
				awardTypeId,
				category: params.category,
				title: params.title.trim(),
				description: params.description?.trim(),
				isManagerAward: false,
				isAiGenerated: true, // AI shoutouts are auto-approved
				sourceType: 'ai',
				sourceId: context.runId
			});

			log.info({
				shoutoutId: shoutout.id,
				userId: params.userId,
				userName: user.name,
				category: params.category,
				pointsAwarded: shoutout.pointsAwarded,
				awardTypeId
			}, 'AI gave shoutout');

			// Optionally announce to team
			if (params.announceToTeam) {
				// Import send message function if needed
				// For now, this is handled by the notification system
				log.info({ shoutoutId: shoutout.id }, 'Team announcement requested');
			}

			return {
				success: true,
				shoutoutId: shoutout.id,
				userName: user.name,
				pointsAwarded: shoutout.pointsAwarded
			};
		} catch (error) {
			log.error('Give shoutout tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GiveShoutoutResult): string {
		if (result.success) {
			let msg = `Gave shoutout to ${result.userName || 'user'}`;
			if (result.pointsAwarded && result.pointsAwarded > 0) {
				msg += ` (+${result.pointsAwarded} points)`;
			}
			return msg;
		}
		return `Failed to give shoutout: ${result.error}`;
	}
};
