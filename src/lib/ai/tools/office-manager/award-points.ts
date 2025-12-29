// Award Points Tool - Allows AI to directly award bonus points to users
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';
import { awardPoints, getOrCreateUserStats } from '$lib/server/services/points-service';

const log = createLogger('ai:tools:award-points');

interface AwardPointsParams {
	userId: string;
	points: number;
	reason: string;
	category?: 'bonus' | 'achievement';
}

interface AwardPointsResult {
	success: boolean;
	userName?: string;
	pointsAwarded?: number;
	newTotal?: number;
	levelUp?: boolean;
	error?: string;
}

export const awardPointsTool: AITool<AwardPointsParams, AwardPointsResult> = {
	name: 'award_points',
	description: 'Award bonus points to a user for recognition or achievement. Use this to reward exceptional performance, milestone achievements, or positive behaviors you observe. Points are added immediately to their total.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user ID to award points to'
			},
			points: {
				type: 'number',
				description: 'Number of points to award (1-500)'
			},
			reason: {
				type: 'string',
				description: 'Brief explanation of why points are being awarded (shown to user)'
			},
			category: {
				type: 'string',
				enum: ['bonus', 'achievement'],
				description: 'Category for the points (default: bonus)'
			}
		},
		required: ['userId', 'points', 'reason']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 60, // Only award to same user once per hour
		global: 10   // Global cooldown of 10 minutes
	},
	rateLimit: {
		maxPerHour: 10
	},

	validate(params: AwardPointsParams) {
		// Validate userId
		const userValidation = validateUserId(params.userId, 'userId');
		if (!userValidation.valid) return userValidation;

		// Validate points
		if (typeof params.points !== 'number' || !Number.isInteger(params.points)) {
			return { valid: false, error: 'Points must be a whole number' };
		}
		if (params.points < 1 || params.points > 500) {
			return { valid: false, error: 'Points must be between 1 and 500' };
		}

		// Validate reason
		if (!params.reason || params.reason.trim().length < 5) {
			return { valid: false, error: 'Reason must be at least 5 characters' };
		}
		if (params.reason.length > 200) {
			return { valid: false, error: 'Reason must be under 200 characters' };
		}

		return { valid: true };
	},

	async execute(params: AwardPointsParams, context: ToolExecutionContext): Promise<AwardPointsResult> {
		if (context.dryRun) {
			return {
				success: true,
				pointsAwarded: params.points,
				error: 'Dry run - points would be awarded'
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
				return { success: false, error: 'Cannot award points to inactive user' };
			}

			// Award the points
			const result = await awardPoints({
				userId: params.userId,
				basePoints: params.points,
				category: params.category || 'bonus',
				action: 'ai_award',
				description: params.reason,
				sourceType: 'ai',
				sourceId: context.runId,
				applyStreakMultiplier: false // AI awards don't get streak bonus
			});

			log.info({
				userId: params.userId,
				userName: user.name,
				points: params.points,
				reason: params.reason,
				newTotal: result.newTotal,
				levelUp: result.levelUp
			}, 'AI awarded points');

			return {
				success: true,
				userName: user.name,
				pointsAwarded: params.points,
				newTotal: result.newTotal,
				levelUp: result.levelUp
			};
		} catch (error) {
			log.error('Award points tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: AwardPointsResult): string {
		if (result.success) {
			let msg = `Awarded ${result.pointsAwarded} points to ${result.userName || 'user'}`;
			if (result.levelUp) {
				msg += ' (Level up!)';
			}
			return msg;
		}
		return `Failed to award points: ${result.error}`;
	}
};
