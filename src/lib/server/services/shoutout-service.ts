/**
 * Shoutout Service
 *
 * Handles peer recognition and manager awards:
 * - Creating shoutouts (nominations and direct awards)
 * - Approval workflow for peer nominations
 * - Integration with points system
 * - Recognition feed and history
 */

import {
	db,
	shoutouts,
	awardTypes,
	users,
	notifications
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, desc, sql, or, isNull } from 'drizzle-orm';
import type { Shoutout, AwardType, NewShoutout } from '$lib/server/db/schema';
import { awardPoints } from './points-service';

const log = createLogger('services:shoutout');

// ============================================================================
// TYPES
// ============================================================================

export type ShoutoutCategory =
	| 'teamwork'
	| 'quality'
	| 'initiative'
	| 'customer'
	| 'mentoring'
	| 'innovation'
	| 'reliability'
	| 'general';

export interface CreateShoutoutParams {
	recipientId: string;
	nominatorId?: string | null; // null = system/AI
	awardTypeId?: string;
	category: ShoutoutCategory;
	title: string;
	description?: string;
	isManagerAward?: boolean;
	isAiGenerated?: boolean;
	sourceType?: 'task' | 'pricing' | 'message' | 'manual' | 'ai';
	sourceId?: string;
}

export interface ShoutoutWithDetails extends Shoutout {
	recipient: { id: string; name: string };
	nominator: { id: string; name: string } | null;
	approvedBy: { id: string; name: string } | null;
	awardType: AwardType | null;
}

// ============================================================================
// AWARD TYPES
// ============================================================================

/**
 * Get all active award types
 */
export async function getAwardTypes(includeManagerOnly = true): Promise<AwardType[]> {
	const conditions = [eq(awardTypes.isActive, true)];

	if (!includeManagerOnly) {
		conditions.push(eq(awardTypes.managerOnly, false));
	}

	return db
		.select()
		.from(awardTypes)
		.where(and(...conditions))
		.orderBy(desc(awardTypes.points));
}

/**
 * Get a single award type by ID
 */
export async function getAwardType(id: string): Promise<AwardType | null> {
	const [result] = await db.select().from(awardTypes).where(eq(awardTypes.id, id));
	return result || null;
}

// ============================================================================
// CREATE SHOUTOUT
// ============================================================================

/**
 * Create a new shoutout/recognition
 *
 * Auto-approval rules:
 * - Manager awards (isManagerAward = true) are auto-approved
 * - AI-generated shoutouts (isAiGenerated = true) are auto-approved
 * - Peer nominations require manager approval
 */
export async function createShoutout(params: CreateShoutoutParams): Promise<ShoutoutWithDetails> {
	const {
		recipientId,
		nominatorId = null,
		awardTypeId,
		category,
		title,
		description,
		isManagerAward = false,
		isAiGenerated = false,
		sourceType,
		sourceId
	} = params;

	// Get award type for point values
	let pointsToAward = 25; // Default for quick shoutout
	let awardType: AwardType | null = null;

	if (awardTypeId) {
		awardType = await getAwardType(awardTypeId);
		if (awardType) {
			pointsToAward = awardType.points;
		}
	}

	// Determine if auto-approval applies
	const autoApprove = isManagerAward || isAiGenerated;
	const requiresApproval = !autoApprove;
	const status = autoApprove ? 'approved' : 'pending';
	const approvedAt = autoApprove ? new Date() : null;
	const approvedById = autoApprove ? nominatorId : null;

	// Create the shoutout
	const [shoutout] = await db
		.insert(shoutouts)
		.values({
			recipientId,
			nominatorId,
			approvedById,
			awardTypeId: awardTypeId || null,
			category,
			title,
			description,
			isManagerAward,
			isAiGenerated,
			requiresApproval,
			status,
			pointsAwarded: autoApprove ? pointsToAward : 0,
			isPublic: true,
			sourceType,
			sourceId,
			approvedAt
		} as NewShoutout)
		.returning();

	log.info({
		shoutoutId: shoutout.id,
		recipientId,
		nominatorId,
		category,
		isManagerAward,
		isAiGenerated,
		autoApprove,
		pointsToAward: autoApprove ? pointsToAward : 0
	}, 'Shoutout created');

	// If auto-approved, award points immediately
	if (autoApprove) {
		await awardShoutoutPoints(shoutout.id, recipientId, pointsToAward, title, awardType?.name);
		await notifyRecipient(shoutout.id, recipientId, nominatorId, title);
	} else {
		// Notify managers about pending approval
		await notifyManagersAboutPending(shoutout.id, recipientId, nominatorId, title);
	}

	return getShoutoutWithDetails(shoutout.id) as Promise<ShoutoutWithDetails>;
}

// ============================================================================
// APPROVAL WORKFLOW
// ============================================================================

/**
 * Approve a pending shoutout (manager action)
 */
export async function approveShoutout(
	shoutoutId: string,
	approverId: string
): Promise<ShoutoutWithDetails | null> {
	// Get the shoutout
	const [shoutout] = await db.select().from(shoutouts).where(eq(shoutouts.id, shoutoutId));

	if (!shoutout) {
		log.warn({ shoutoutId }, 'Shoutout not found for approval');
		return null;
	}

	if (shoutout.status !== 'pending') {
		log.warn({ shoutoutId, status: shoutout.status }, 'Shoutout not in pending status');
		return null;
	}

	// Get award type for point value
	let pointsToAward = 25;
	let awardTypeName: string | undefined;

	if (shoutout.awardTypeId) {
		const awardType = await getAwardType(shoutout.awardTypeId);
		if (awardType) {
			pointsToAward = awardType.points;
			awardTypeName = awardType.name;
		}
	}

	// Update the shoutout
	await db
		.update(shoutouts)
		.set({
			status: 'approved',
			approvedById: approverId,
			approvedAt: new Date(),
			pointsAwarded: pointsToAward
		})
		.where(eq(shoutouts.id, shoutoutId));

	log.info({ shoutoutId, approverId, pointsToAward }, 'Shoutout approved');

	// Award points
	await awardShoutoutPoints(shoutoutId, shoutout.recipientId, pointsToAward, shoutout.title, awardTypeName);

	// Notify recipient
	await notifyRecipient(shoutoutId, shoutout.recipientId, shoutout.nominatorId, shoutout.title);

	return getShoutoutWithDetails(shoutoutId);
}

/**
 * Reject a pending shoutout (manager action)
 */
export async function rejectShoutout(
	shoutoutId: string,
	rejectorId: string,
	reason?: string
): Promise<ShoutoutWithDetails | null> {
	const [shoutout] = await db.select().from(shoutouts).where(eq(shoutouts.id, shoutoutId));

	if (!shoutout) {
		log.warn({ shoutoutId }, 'Shoutout not found for rejection');
		return null;
	}

	if (shoutout.status !== 'pending') {
		log.warn({ shoutoutId, status: shoutout.status }, 'Shoutout not in pending status');
		return null;
	}

	await db
		.update(shoutouts)
		.set({
			status: 'rejected',
			approvedById: rejectorId,
			rejectionReason: reason
		})
		.where(eq(shoutouts.id, shoutoutId));

	log.info({ shoutoutId, rejectorId, reason }, 'Shoutout rejected');

	// Optionally notify nominator about rejection
	if (shoutout.nominatorId) {
		await db.insert(notifications).values({
			userId: shoutout.nominatorId,
			type: 'new_message', // Reuse existing type
			title: 'Shoutout Not Approved',
			message: `Your shoutout for a coworker was not approved${reason ? `: ${reason}` : '.'}`,
			data: { shoutoutId, type: 'shoutout_rejected' }
		});
	}

	return getShoutoutWithDetails(shoutoutId);
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a shoutout with all related details
 */
export async function getShoutoutWithDetails(shoutoutId: string): Promise<ShoutoutWithDetails | null> {
	const result = await db
		.select({
			shoutout: shoutouts,
			recipient: {
				id: users.id,
				name: users.name
			}
		})
		.from(shoutouts)
		.innerJoin(users, eq(shoutouts.recipientId, users.id))
		.where(eq(shoutouts.id, shoutoutId));

	if (!result.length) return null;

	const { shoutout } = result[0];

	// Get nominator if exists
	let nominator: { id: string; name: string } | null = null;
	if (shoutout.nominatorId) {
		const [n] = await db.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.id, shoutout.nominatorId));
		nominator = n || null;
	}

	// Get approver if exists
	let approvedBy: { id: string; name: string } | null = null;
	if (shoutout.approvedById) {
		const [a] = await db.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.id, shoutout.approvedById));
		approvedBy = a || null;
	}

	// Get award type if exists
	let awardType: AwardType | null = null;
	if (shoutout.awardTypeId) {
		awardType = await getAwardType(shoutout.awardTypeId);
	}

	return {
		...shoutout,
		recipient: result[0].recipient,
		nominator,
		approvedBy,
		awardType
	};
}

/**
 * Get shoutouts received by a user
 */
export async function getShoutoutsForUser(
	userId: string,
	options?: { limit?: number; includePrivate?: boolean }
): Promise<ShoutoutWithDetails[]> {
	const { limit = 50, includePrivate = false } = options || {};

	const conditions = [
		eq(shoutouts.recipientId, userId),
		eq(shoutouts.status, 'approved')
	];

	if (!includePrivate) {
		conditions.push(eq(shoutouts.isPublic, true));
	}

	const results = await db
		.select({
			shoutout: shoutouts,
			recipient: { id: users.id, name: users.name }
		})
		.from(shoutouts)
		.innerJoin(users, eq(shoutouts.recipientId, users.id))
		.where(and(...conditions))
		.orderBy(desc(shoutouts.createdAt))
		.limit(limit);

	// Enrich with related data
	return Promise.all(
		results.map(async (r) => {
			const shoutout = r.shoutout;

			let nominator: { id: string; name: string } | null = null;
			if (shoutout.nominatorId) {
				const [n] = await db.select({ id: users.id, name: users.name })
					.from(users).where(eq(users.id, shoutout.nominatorId));
				nominator = n || null;
			}

			let awardType: AwardType | null = null;
			if (shoutout.awardTypeId) {
				awardType = await getAwardType(shoutout.awardTypeId);
			}

			return {
				...shoutout,
				recipient: r.recipient,
				nominator,
				approvedBy: null,
				awardType
			};
		})
	);
}

/**
 * Get pending shoutouts awaiting approval (for managers)
 */
export async function getPendingShoutouts(): Promise<ShoutoutWithDetails[]> {
	const results = await db
		.select({
			shoutout: shoutouts,
			recipient: { id: users.id, name: users.name }
		})
		.from(shoutouts)
		.innerJoin(users, eq(shoutouts.recipientId, users.id))
		.where(eq(shoutouts.status, 'pending'))
		.orderBy(desc(shoutouts.createdAt));

	return Promise.all(
		results.map(async (r) => {
			const shoutout = r.shoutout;

			let nominator: { id: string; name: string } | null = null;
			if (shoutout.nominatorId) {
				const [n] = await db.select({ id: users.id, name: users.name })
					.from(users).where(eq(users.id, shoutout.nominatorId));
				nominator = n || null;
			}

			let awardType: AwardType | null = null;
			if (shoutout.awardTypeId) {
				awardType = await getAwardType(shoutout.awardTypeId);
			}

			return {
				...shoutout,
				recipient: r.recipient,
				nominator,
				approvedBy: null,
				awardType
			};
		})
	);
}

/**
 * Get recent public shoutouts (for recognition feed)
 */
export async function getRecentShoutouts(limit = 20): Promise<ShoutoutWithDetails[]> {
	const results = await db
		.select({
			shoutout: shoutouts,
			recipient: { id: users.id, name: users.name }
		})
		.from(shoutouts)
		.innerJoin(users, eq(shoutouts.recipientId, users.id))
		.where(and(
			eq(shoutouts.status, 'approved'),
			eq(shoutouts.isPublic, true)
		))
		.orderBy(desc(shoutouts.approvedAt))
		.limit(limit);

	return Promise.all(
		results.map(async (r) => {
			const shoutout = r.shoutout;

			let nominator: { id: string; name: string } | null = null;
			if (shoutout.nominatorId) {
				const [n] = await db.select({ id: users.id, name: users.name })
					.from(users).where(eq(users.id, shoutout.nominatorId));
				nominator = n || null;
			}

			let awardType: AwardType | null = null;
			if (shoutout.awardTypeId) {
				awardType = await getAwardType(shoutout.awardTypeId);
			}

			return {
				...shoutout,
				recipient: r.recipient,
				nominator,
				approvedBy: null,
				awardType
			};
		})
	);
}

/**
 * Get count of pending shoutouts (for admin badge)
 */
export async function getPendingShoutoutCount(): Promise<number> {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(shoutouts)
		.where(eq(shoutouts.status, 'pending'));

	return result?.count || 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Award points for an approved shoutout
 */
async function awardShoutoutPoints(
	shoutoutId: string,
	recipientId: string,
	points: number,
	title: string,
	awardTypeName?: string
): Promise<void> {
	try {
		await awardPoints({
			userId: recipientId,
			basePoints: points,
			category: 'bonus',
			action: 'shoutout_received',
			description: awardTypeName ? `${awardTypeName}: ${title}` : title,
			sourceType: 'shoutout',
			sourceId: shoutoutId,
			applyStreakMultiplier: false // Shoutouts don't get streak bonus
		});
	} catch (error) {
		log.error({ error, shoutoutId, recipientId }, 'Failed to award shoutout points');
	}
}

/**
 * Notify recipient about their shoutout
 */
async function notifyRecipient(
	shoutoutId: string,
	recipientId: string,
	nominatorId: string | null,
	title: string
): Promise<void> {
	try {
		const nominatorName = nominatorId ? await getUserName(nominatorId) : 'the team';

		await db.insert(notifications).values({
			userId: recipientId,
			type: 'new_message', // Reuse existing notification type
			title: 'You received a shoutout!',
			message: `${nominatorName} recognized you: "${title}"`,
			data: { shoutoutId, type: 'shoutout_received' }
		});
	} catch (error) {
		log.error({ error, shoutoutId, recipientId }, 'Failed to notify recipient');
	}
}

/**
 * Notify managers about a pending shoutout
 */
async function notifyManagersAboutPending(
	shoutoutId: string,
	recipientId: string,
	nominatorId: string | null,
	title: string
): Promise<void> {
	try {
		// Get all managers and admins
		const managers = await db
			.select({ id: users.id })
			.from(users)
			.where(
				and(
					eq(users.isActive, true),
					or(
						eq(users.role, 'admin'),
						eq(users.role, 'manager')
					)
				)
			);

		const nominatorName = nominatorId ? await getUserName(nominatorId) : 'Someone';
		const recipientName = await getUserName(recipientId);

		for (const manager of managers) {
			await db.insert(notifications).values({
				userId: manager.id,
				type: 'new_message',
				title: 'Shoutout Pending Approval',
				message: `${nominatorName} wants to recognize ${recipientName}: "${title}"`,
				data: { shoutoutId, type: 'shoutout_pending' }
			});
		}
	} catch (error) {
		log.error({ error, shoutoutId }, 'Failed to notify managers');
	}
}

/**
 * Get user's display name
 */
async function getUserName(userId: string): Promise<string> {
	const [user] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId));
	return user?.name || 'Unknown';
}
