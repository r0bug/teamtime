// Group Sync Service - Manages group chat synchronization with userTypes
// Auto-creates groups for userTypes and syncs membership

import {
	db,
	users,
	userTypes,
	groups,
	groupMembers,
	conversations,
	conversationParticipants
} from '$lib/server/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('group-sync');

export interface GroupWithDetails {
	id: string;
	name: string;
	description: string | null;
	conversationId: string;
	linkedUserTypeId: string | null;
	isAutoSynced: boolean;
	color: string | null;
	isActive: boolean;
	memberCount: number;
}

/**
 * Sync all userTypes with their corresponding groups
 * Creates groups for userTypes that don't have one
 */
export async function syncUserTypeGroups(): Promise<{ created: number; synced: number }> {
	let created = 0;
	let synced = 0;

	// Get all active userTypes
	const activeUserTypes = await db
		.select()
		.from(userTypes)
		.where(eq(userTypes.isActive, true));

	for (const userType of activeUserTypes) {
		// Check if this userType already has a linked group
		const existingGroup = await db
			.select()
			.from(groups)
			.where(eq(groups.linkedUserTypeId, userType.id))
			.limit(1);

		if (existingGroup.length === 0) {
			// Create new group for this userType
			await createGroupForUserType(userType.id, userType.name, userType.color);
			created++;
		} else {
			// Sync membership for existing group
			await syncGroupMembership(existingGroup[0].id, userType.id);
			synced++;
		}
	}

	log.info({ created, synced }, 'UserType groups synced');
	return { created, synced };
}

/**
 * Create a group and conversation for a userType
 */
export async function createGroupForUserType(
	userTypeId: string,
	userTypeName: string,
	color: string | null = null
): Promise<string> {
	// Create conversation first
	const [conversation] = await db
		.insert(conversations)
		.values({
			type: 'group',
			title: `${userTypeName} Group Chat`
		})
		.returning();

	// Create group linked to userType
	const [group] = await db
		.insert(groups)
		.values({
			name: userTypeName,
			description: `Group chat for ${userTypeName} team members`,
			conversationId: conversation.id,
			linkedUserTypeId: userTypeId,
			isAutoSynced: true,
			color: color || '#6B7280'
		})
		.returning();

	// Add all users with this userType
	await syncGroupMembership(group.id, userTypeId);

	log.info({ userTypeId, userTypeName, groupId: group.id }, 'Created group for userType');
	return group.id;
}

/**
 * Sync group membership based on userType
 * Adds users who should be in the group, removes users who shouldn't
 */
export async function syncGroupMembership(groupId: string, userTypeId: string): Promise<void> {
	// Get the group's conversation ID
	const [group] = await db
		.select({ conversationId: groups.conversationId })
		.from(groups)
		.where(eq(groups.id, groupId))
		.limit(1);

	if (!group) {
		throw new Error(`Group ${groupId} not found`);
	}

	// Get all active users with this userType
	const usersWithType = await db
		.select({ id: users.id })
		.from(users)
		.where(and(
			eq(users.userTypeId, userTypeId),
			eq(users.isActive, true)
		));

	const userIds = usersWithType.map(u => u.id);

	// Get current auto-assigned members
	const currentMembers = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.isAutoAssigned, true)
		));

	const currentMemberIds = currentMembers.map(m => m.userId);

	// Add new members
	for (const userId of userIds) {
		if (!currentMemberIds.includes(userId)) {
			await addUserToGroup(groupId, userId, true);
		}
	}

	// Remove members no longer in the userType (only if auto-assigned)
	for (const memberId of currentMemberIds) {
		if (!userIds.includes(memberId)) {
			await removeUserFromGroup(groupId, memberId, true);
		}
	}
}

/**
 * Add a user to a group
 */
export async function addUserToGroup(
	groupId: string,
	userId: string,
	isAutoAssigned: boolean = false,
	addedById?: string,
	role: 'admin' | 'member' = 'member'
): Promise<void> {
	// Get the group's conversation ID
	const [group] = await db
		.select({ conversationId: groups.conversationId })
		.from(groups)
		.where(eq(groups.id, groupId))
		.limit(1);

	if (!group) {
		throw new Error(`Group ${groupId} not found`);
	}

	// Check if already a member
	const existingMember = await db
		.select()
		.from(groupMembers)
		.where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.userId, userId)
		))
		.limit(1);

	if (existingMember.length > 0) {
		return; // Already a member
	}

	// Add to group_members
	await db.insert(groupMembers).values({
		groupId,
		userId,
		role,
		isAutoAssigned,
		addedBy: addedById
	});

	// Also add to conversation_participants for read tracking
	const existingParticipant = await db
		.select()
		.from(conversationParticipants)
		.where(and(
			eq(conversationParticipants.conversationId, group.conversationId),
			eq(conversationParticipants.userId, userId)
		))
		.limit(1);

	if (existingParticipant.length === 0) {
		await db.insert(conversationParticipants).values({
			conversationId: group.conversationId,
			userId
		});
	}

	log.info({ groupId, userId, isAutoAssigned }, 'User added to group');
}

/**
 * Remove a user from a group
 */
export async function removeUserFromGroup(
	groupId: string,
	userId: string,
	onlyAutoAssigned: boolean = false
): Promise<void> {
	// Get the group's conversation ID
	const [group] = await db
		.select({ conversationId: groups.conversationId })
		.from(groups)
		.where(eq(groups.id, groupId))
		.limit(1);

	if (!group) {
		throw new Error(`Group ${groupId} not found`);
	}

	// Remove from group_members (optionally only if auto-assigned)
	if (onlyAutoAssigned) {
		await db.delete(groupMembers).where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.userId, userId),
			eq(groupMembers.isAutoAssigned, true)
		));
	} else {
		await db.delete(groupMembers).where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.userId, userId)
		));
	}

	// Also remove from conversation_participants
	await db.delete(conversationParticipants).where(and(
		eq(conversationParticipants.conversationId, group.conversationId),
		eq(conversationParticipants.userId, userId)
	));

	log.info({ groupId, userId, onlyAutoAssigned }, 'User removed from group');
}

/**
 * Handle user type change - remove from old group, add to new
 */
export async function handleUserTypeChange(
	userId: string,
	oldTypeId: string | null,
	newTypeId: string | null
): Promise<void> {
	// Remove from old type's group if exists
	if (oldTypeId) {
		const oldGroup = await getGroupByUserType(oldTypeId);
		if (oldGroup?.isAutoSynced) {
			await removeUserFromGroup(oldGroup.id, userId, true);
		}
	}

	// Add to new type's group if exists
	if (newTypeId) {
		const newGroup = await getGroupByUserType(newTypeId);
		if (newGroup?.isAutoSynced) {
			await addUserToGroup(newGroup.id, userId, true);
		}
	}

	log.info({ userId, oldTypeId, newTypeId }, 'User type changed, group membership updated');
}

/**
 * Get group by userType ID
 */
export async function getGroupByUserType(userTypeId: string): Promise<GroupWithDetails | null> {
	const result = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			conversationId: groups.conversationId,
			linkedUserTypeId: groups.linkedUserTypeId,
			isAutoSynced: groups.isAutoSynced,
			color: groups.color,
			isActive: groups.isActive,
			memberCount: sql<number>`(
				SELECT COUNT(*) FROM group_members WHERE group_id = ${groups.id}
			)::int`
		})
		.from(groups)
		.where(eq(groups.linkedUserTypeId, userTypeId))
		.limit(1);

	return result[0] || null;
}

/**
 * Get all groups a user is a member of
 */
export async function getUserGroups(userId: string): Promise<GroupWithDetails[]> {
	const result = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			conversationId: groups.conversationId,
			linkedUserTypeId: groups.linkedUserTypeId,
			isAutoSynced: groups.isAutoSynced,
			color: groups.color,
			isActive: groups.isActive,
			memberCount: sql<number>`(
				SELECT COUNT(*) FROM group_members WHERE group_id = ${groups.id}
			)::int`
		})
		.from(groups)
		.innerJoin(groupMembers, eq(groups.id, groupMembers.groupId))
		.where(and(
			eq(groupMembers.userId, userId),
			eq(groups.isActive, true)
		));

	return result;
}

/**
 * Get all groups (for admin)
 */
export async function getAllGroups(): Promise<GroupWithDetails[]> {
	const result = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			conversationId: groups.conversationId,
			linkedUserTypeId: groups.linkedUserTypeId,
			isAutoSynced: groups.isAutoSynced,
			color: groups.color,
			isActive: groups.isActive,
			memberCount: sql<number>`(
				SELECT COUNT(*) FROM group_members WHERE group_id = ${groups.id}
			)::int`
		})
		.from(groups);

	return result;
}

/**
 * Create a custom group (not linked to userType)
 */
export async function createCustomGroup(
	name: string,
	description: string | null,
	memberIds: string[],
	createdById: string,
	color: string = '#6B7280'
): Promise<string> {
	// Create conversation
	const [conversation] = await db
		.insert(conversations)
		.values({
			type: 'group',
			title: name,
			createdBy: createdById
		})
		.returning();

	// Create group
	const [group] = await db
		.insert(groups)
		.values({
			name,
			description,
			conversationId: conversation.id,
			isAutoSynced: false,
			color,
			createdBy: createdById
		})
		.returning();

	// Add members
	for (const memberId of memberIds) {
		await addUserToGroup(group.id, memberId, false, createdById);
	}

	// Always add creator as admin
	if (!memberIds.includes(createdById)) {
		await addUserToGroup(group.id, createdById, false, createdById, 'admin');
	} else {
		// Update creator's role to admin
		await db.update(groupMembers)
			.set({ role: 'admin' })
			.where(and(
				eq(groupMembers.groupId, group.id),
				eq(groupMembers.userId, createdById)
			));
	}

	log.info({ groupId: group.id, name, memberCount: memberIds.length }, 'Custom group created');
	return group.id;
}

/**
 * Update group details
 */
export async function updateGroup(
	groupId: string,
	updates: {
		name?: string;
		description?: string | null;
		color?: string;
		isActive?: boolean;
	}
): Promise<void> {
	await db.update(groups)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(groups.id, groupId));

	log.info({ groupId, updates }, 'Group updated');
}

/**
 * Get group members with user details
 */
export async function getGroupMembers(groupId: string): Promise<Array<{
	userId: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	role: string;
	isAutoAssigned: boolean;
	joinedAt: Date;
}>> {
	const result = await db
		.select({
			userId: groupMembers.userId,
			name: users.name,
			email: users.email,
			avatarUrl: users.avatarUrl,
			role: groupMembers.role,
			isAutoAssigned: groupMembers.isAutoAssigned,
			joinedAt: groupMembers.joinedAt
		})
		.from(groupMembers)
		.innerJoin(users, eq(groupMembers.userId, users.id))
		.where(eq(groupMembers.groupId, groupId));

	return result;
}

/**
 * Check if user is member of a group
 */
export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
	const result = await db
		.select({ id: groupMembers.id })
		.from(groupMembers)
		.where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.userId, userId)
		))
		.limit(1);

	return result.length > 0;
}

/**
 * Check if user is admin of a group
 */
export async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
	const result = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(and(
			eq(groupMembers.groupId, groupId),
			eq(groupMembers.userId, userId)
		))
		.limit(1);

	return result.length > 0 && result[0].role === 'admin';
}

/**
 * Get group by ID
 */
export async function getGroup(groupId: string): Promise<GroupWithDetails | null> {
	const result = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			conversationId: groups.conversationId,
			linkedUserTypeId: groups.linkedUserTypeId,
			isAutoSynced: groups.isAutoSynced,
			color: groups.color,
			isActive: groups.isActive,
			memberCount: sql<number>`(
				SELECT COUNT(*) FROM group_members WHERE group_id = ${groups.id}
			)::int`
		})
		.from(groups)
		.where(eq(groups.id, groupId))
		.limit(1);

	return result[0] || null;
}
