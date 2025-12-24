// Visibility Service - Controls what data users can see
// Implements a layered visibility system: System Rules < Custom Groups < Explicit Grants

import {
	db,
	users,
	visibilityGroups,
	visibilityGroupMembers,
	visibilityRules,
	userVisibilityGrants,
	visibilityPresets
} from '$lib/server/db';
import type {
	VisibilityGroup,
	VisibilityRule,
	UserVisibilityGrant,
	VisibilityPreset
} from '$lib/server/db/schema';
import { eq, and, or, inArray, isNull, sql, desc, gte } from 'drizzle-orm';

// Types
export type VisibilityCategory = 'tasks' | 'messages' | 'schedule' | 'attendance' | 'users' | 'pricing' | 'expenses';
export type UserRole = 'admin' | 'manager' | 'purchaser' | 'staff';
export type VisibilityLevel = 'none' | 'own' | 'same_group' | 'same_role' | 'lower_roles' | 'all';

export interface VisibilityContext {
	userId: string;
	userRole: UserRole;
	groupIds: string[];
	explicitGrants: UserVisibilityGrant[];
}

export interface VisibilityFilter {
	allowedUserIds: string[];      // Specific users whose data is visible
	allowedGroupIds: string[];     // Groups whose members' data is visible
	allowedRoles: UserRole[];      // Roles whose data is visible
	includeOwn: boolean;           // Always include user's own data
	includeAll: boolean;           // Full visibility (admin override)
}

// Role hierarchy for "lower_roles" visibility
const ROLE_HIERARCHY: { [key in UserRole]: UserRole[] } = {
	admin: ['manager', 'purchaser', 'staff'],
	manager: ['purchaser', 'staff'],
	purchaser: ['staff'],
	staff: []
};

// Cache with 60-second TTL
const cache = new Map<string, { context: VisibilityContext; expires: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Clear the visibility cache for a specific user or all users
 */
export function invalidateCache(userId?: string): void {
	if (userId) {
		cache.delete(userId);
	} else {
		cache.clear();
	}
}

/**
 * Get user's visibility context (cached)
 */
export async function getVisibilityContext(userId: string): Promise<VisibilityContext> {
	// Check cache first
	const cached = cache.get(userId);
	if (cached && cached.expires > Date.now()) {
		return cached.context;
	}

	// Fetch user info
	const userResult = await db
		.select({
			id: users.id,
			role: users.role
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (userResult.length === 0) {
		throw new Error(`User ${userId} not found`);
	}

	const userRole = userResult[0].role as UserRole;

	// Fetch group memberships
	const groupMemberships = await db
		.select({ groupId: visibilityGroupMembers.groupId })
		.from(visibilityGroupMembers)
		.innerJoin(visibilityGroups, eq(visibilityGroupMembers.groupId, visibilityGroups.id))
		.where(
			and(
				eq(visibilityGroupMembers.userId, userId),
				eq(visibilityGroups.isActive, true)
			)
		);

	const groupIds = groupMemberships.map(m => m.groupId);

	// Fetch explicit grants
	const grants = await db
		.select()
		.from(userVisibilityGrants)
		.where(
			and(
				eq(userVisibilityGrants.userId, userId),
				eq(userVisibilityGrants.isActive, true),
				or(
					isNull(userVisibilityGrants.expiresAt),
					gte(userVisibilityGrants.expiresAt, new Date())
				)
			)
		);

	const context: VisibilityContext = {
		userId,
		userRole,
		groupIds,
		explicitGrants: grants
	};

	// Cache the result
	cache.set(userId, { context, expires: Date.now() + CACHE_TTL_MS });

	return context;
}

/**
 * Get visibility filter for a specific data category
 */
export async function getVisibilityFilter(
	userId: string,
	category: VisibilityCategory
): Promise<VisibilityFilter> {
	const ctx = await getVisibilityContext(userId);

	// Admin always sees everything
	if (ctx.userRole === 'admin') {
		return {
			allowedUserIds: [],
			allowedGroupIds: [],
			allowedRoles: [],
			includeOwn: true,
			includeAll: true
		};
	}

	const filter: VisibilityFilter = {
		allowedUserIds: [userId], // Always see own data
		allowedGroupIds: [],
		allowedRoles: [],
		includeOwn: true,
		includeAll: false
	};

	// 1. Check explicit user grants (highest priority)
	for (const grant of ctx.explicitGrants) {
		if (grant.dataCategory === category && grant.isActive && grant.grantType !== 'none') {
			if (grant.targetUserId) {
				filter.allowedUserIds.push(grant.targetUserId);
			}
			if (grant.targetGroupId) {
				filter.allowedGroupIds.push(grant.targetGroupId);
			}
			if (grant.targetRole) {
				filter.allowedRoles.push(grant.targetRole as UserRole);
			}
		}
	}

	// 2. Check custom group rules
	// Group membership typically grants visibility to other group members
	if (ctx.groupIds.length > 0) {
		// For each group, check if there's a rule that grants visibility within that group
		const groupRules = await db
			.select()
			.from(visibilityRules)
			.where(
				and(
					eq(visibilityRules.category, category),
					eq(visibilityRules.isEnabled, true),
					inArray(visibilityRules.viewerGroupId, ctx.groupIds),
					or(
						eq(visibilityRules.visibilityLevel, 'same_group'),
						eq(visibilityRules.visibilityLevel, 'all')
					)
				)
			)
			.orderBy(desc(visibilityRules.priority));

		for (const rule of groupRules) {
			if (rule.visibilityLevel === 'same_group') {
				// Add the viewer's groups (since they're in those groups)
				filter.allowedGroupIds.push(...ctx.groupIds);
			} else if (rule.visibilityLevel === 'all') {
				filter.includeAll = true;
				break;
			}
		}
	}

	// 3. Check system rules (role-based, lowest priority unless already granted)
	if (!filter.includeAll) {
		const systemRules = await db
			.select()
			.from(visibilityRules)
			.where(
				and(
					eq(visibilityRules.category, category),
					eq(visibilityRules.isEnabled, true),
					eq(visibilityRules.viewerRole, ctx.userRole),
					isNull(visibilityRules.viewerGroupId) // System rules have no viewer group
				)
			)
			.orderBy(desc(visibilityRules.priority));

		for (const rule of systemRules) {
			switch (rule.visibilityLevel) {
				case 'all':
					filter.includeAll = true;
					break;
				case 'same_role':
					filter.allowedRoles.push(ctx.userRole);
					break;
				case 'lower_roles':
					filter.allowedRoles.push(...ROLE_HIERARCHY[ctx.userRole]);
					break;
				case 'same_group':
					filter.allowedGroupIds.push(...ctx.groupIds);
					break;
				// 'none' and 'own' don't add anything beyond the default
			}

			if (filter.includeAll) break;
		}
	}

	// Deduplicate arrays
	filter.allowedUserIds = [...new Set(filter.allowedUserIds)];
	filter.allowedGroupIds = [...new Set(filter.allowedGroupIds)];
	filter.allowedRoles = [...new Set(filter.allowedRoles)];

	return filter;
}

/**
 * Get all user IDs that are visible to the given user for a category
 */
export async function getVisibleUserIds(
	viewerId: string,
	category: VisibilityCategory
): Promise<string[]> {
	const filter = await getVisibilityFilter(viewerId, category);

	// If includeAll, return empty array to signal "no filtering needed"
	if (filter.includeAll) {
		return [];
	}

	// Build list of visible users
	const visibleUserIds = new Set<string>(filter.allowedUserIds);

	// Add users from allowed groups
	if (filter.allowedGroupIds.length > 0) {
		const groupMembers = await db
			.select({ userId: visibilityGroupMembers.userId })
			.from(visibilityGroupMembers)
			.where(inArray(visibilityGroupMembers.groupId, filter.allowedGroupIds));

		for (const member of groupMembers) {
			if (member.userId) {
				visibleUserIds.add(member.userId);
			}
		}
	}

	// Add users with allowed roles
	if (filter.allowedRoles.length > 0) {
		const roleUsers = await db
			.select({ id: users.id })
			.from(users)
			.where(
				and(
					inArray(users.role, filter.allowedRoles),
					eq(users.isActive, true)
				)
			);

		for (const user of roleUsers) {
			visibleUserIds.add(user.id);
		}
	}

	return Array.from(visibleUserIds);
}

/**
 * Check if a user can see a specific target user's data
 */
export async function canSeeUserData(
	viewerId: string,
	targetUserId: string,
	category: VisibilityCategory
): Promise<boolean> {
	// Same user can always see their own data
	if (viewerId === targetUserId) {
		return true;
	}

	const filter = await getVisibilityFilter(viewerId, category);

	// Admin or includeAll means full visibility
	if (filter.includeAll) {
		return true;
	}

	// Check if target is in allowed users
	if (filter.allowedUserIds.includes(targetUserId)) {
		return true;
	}

	// Check if target is in an allowed group
	if (filter.allowedGroupIds.length > 0) {
		const targetGroupMembership = await db
			.select({ groupId: visibilityGroupMembers.groupId })
			.from(visibilityGroupMembers)
			.where(
				and(
					eq(visibilityGroupMembers.userId, targetUserId),
					inArray(visibilityGroupMembers.groupId, filter.allowedGroupIds)
				)
			)
			.limit(1);

		if (targetGroupMembership.length > 0) {
			return true;
		}
	}

	// Check if target has an allowed role
	if (filter.allowedRoles.length > 0) {
		const targetUser = await db
			.select({ role: users.role })
			.from(users)
			.where(eq(users.id, targetUserId))
			.limit(1);

		if (targetUser.length > 0 && filter.allowedRoles.includes(targetUser[0].role as UserRole)) {
			return true;
		}
	}

	return false;
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Update a visibility rule's enabled state
 */
export async function updateRule(ruleKey: string, isEnabled: boolean): Promise<void> {
	await db
		.update(visibilityRules)
		.set({ isEnabled, updatedAt: new Date() })
		.where(eq(visibilityRules.ruleKey, ruleKey));

	// Invalidate all cache since this is a system-wide change
	invalidateCache();
}

/**
 * Get all visibility rules
 */
export async function getAllRules(): Promise<VisibilityRule[]> {
	return db
		.select()
		.from(visibilityRules)
		.orderBy(visibilityRules.category, desc(visibilityRules.priority));
}

/**
 * Create a new visibility group
 */
export async function createGroup(
	name: string,
	groupType: 'team' | 'store' | 'department' | 'custom',
	memberIds: string[],
	description?: string,
	locationId?: string
): Promise<string> {
	const [group] = await db
		.insert(visibilityGroups)
		.values({
			name,
			description,
			groupType,
			locationId,
			isActive: true
		})
		.returning({ id: visibilityGroups.id });

	// Add members
	if (memberIds.length > 0) {
		await db.insert(visibilityGroupMembers).values(
			memberIds.map(userId => ({
				groupId: group.id,
				userId,
				isLeader: false
			}))
		);
	}

	return group.id;
}

/**
 * Get all visibility groups
 */
export async function getAllGroups(): Promise<(VisibilityGroup & { memberCount: number })[]> {
	const groups = await db
		.select({
			group: visibilityGroups,
			memberCount: sql<number>`count(${visibilityGroupMembers.id})::int`
		})
		.from(visibilityGroups)
		.leftJoin(visibilityGroupMembers, eq(visibilityGroups.id, visibilityGroupMembers.groupId))
		.where(eq(visibilityGroups.isActive, true))
		.groupBy(visibilityGroups.id)
		.orderBy(visibilityGroups.name);

	return groups.map(g => ({
		...g.group,
		memberCount: g.memberCount
	}));
}

/**
 * Get group members
 */
export async function getGroupMembers(groupId: string): Promise<{ userId: string; name: string; isLeader: boolean }[]> {
	return db
		.select({
			userId: visibilityGroupMembers.userId,
			name: users.name,
			isLeader: visibilityGroupMembers.isLeader
		})
		.from(visibilityGroupMembers)
		.innerJoin(users, eq(visibilityGroupMembers.userId, users.id))
		.where(eq(visibilityGroupMembers.groupId, groupId))
		.orderBy(desc(visibilityGroupMembers.isLeader), users.name);
}

/**
 * Add a user to a group
 */
export async function addUserToGroup(
	userId: string,
	groupId: string,
	isLeader = false
): Promise<void> {
	await db
		.insert(visibilityGroupMembers)
		.values({ userId, groupId, isLeader })
		.onConflictDoUpdate({
			target: [visibilityGroupMembers.groupId, visibilityGroupMembers.userId],
			set: { isLeader }
		});

	invalidateCache(userId);
}

/**
 * Remove a user from a group
 */
export async function removeUserFromGroup(userId: string, groupId: string): Promise<void> {
	await db
		.delete(visibilityGroupMembers)
		.where(
			and(
				eq(visibilityGroupMembers.userId, userId),
				eq(visibilityGroupMembers.groupId, groupId)
			)
		);

	invalidateCache(userId);
}

/**
 * Grant explicit visibility to a user
 */
export async function grantUserVisibility(grant: {
	userId: string;
	dataCategory: VisibilityCategory;
	targetUserId?: string;
	targetGroupId?: string;
	targetRole?: UserRole;
	expiresAt?: Date;
	grantedByUserId: string;
	reason?: string;
}): Promise<string> {
	const [result] = await db
		.insert(userVisibilityGrants)
		.values({
			userId: grant.userId,
			dataCategory: grant.dataCategory,
			targetUserId: grant.targetUserId,
			targetGroupId: grant.targetGroupId,
			targetRole: grant.targetRole,
			grantType: 'view',
			expiresAt: grant.expiresAt,
			grantedByUserId: grant.grantedByUserId,
			reason: grant.reason,
			isActive: true
		})
		.returning({ id: userVisibilityGrants.id });

	invalidateCache(grant.userId);
	return result.id;
}

/**
 * Revoke a visibility grant
 */
export async function revokeGrant(grantId: string): Promise<void> {
	const [grant] = await db
		.update(userVisibilityGrants)
		.set({ isActive: false })
		.where(eq(userVisibilityGrants.id, grantId))
		.returning({ userId: userVisibilityGrants.userId });

	if (grant) {
		invalidateCache(grant.userId);
	}
}

/**
 * Get all active grants for a user (as viewer)
 */
export async function getUserGrants(userId: string): Promise<UserVisibilityGrant[]> {
	return db
		.select()
		.from(userVisibilityGrants)
		.where(
			and(
				eq(userVisibilityGrants.userId, userId),
				eq(userVisibilityGrants.isActive, true)
			)
		);
}

/**
 * Get all presets
 */
export async function getPresets(): Promise<VisibilityPreset[]> {
	return db.select().from(visibilityPresets).orderBy(desc(visibilityPresets.isSystem), visibilityPresets.name);
}

/**
 * Apply a preset - enables/disables rules according to preset configuration
 */
export async function applyPreset(presetId: string): Promise<void> {
	const [preset] = await db
		.select()
		.from(visibilityPresets)
		.where(eq(visibilityPresets.id, presetId));

	if (!preset) {
		throw new Error('Preset not found');
	}

	const ruleConfigs = preset.rules as { ruleKey: string; isEnabled: boolean; visibilityLevel?: string }[];

	for (const config of ruleConfigs) {
		const updates: Partial<VisibilityRule> = {
			isEnabled: config.isEnabled,
			updatedAt: new Date()
		};

		if (config.visibilityLevel) {
			updates.visibilityLevel = config.visibilityLevel as VisibilityLevel;
		}

		await db
			.update(visibilityRules)
			.set(updates)
			.where(eq(visibilityRules.ruleKey, config.ruleKey));
	}

	// Invalidate all caches
	invalidateCache();
}

// Export a singleton-like API
export const visibilityService = {
	invalidateCache,
	getVisibilityContext,
	getVisibilityFilter,
	getVisibleUserIds,
	canSeeUserData,
	updateRule,
	getAllRules,
	createGroup,
	getAllGroups,
	getGroupMembers,
	addUserToGroup,
	removeUserFromGroup,
	grantUserVisibility,
	revokeGrant,
	getUserGrants,
	getPresets,
	applyPreset
};
