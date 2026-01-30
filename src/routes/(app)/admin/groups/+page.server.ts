import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users, userTypes } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';
import {
	getAllGroups,
	syncUserTypeGroups,
	createCustomGroup,
	updateGroup,
	addUserToGroup,
	removeUserFromGroup,
	getGroupMembers,
	getGroup
} from '$lib/server/services/group-sync';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:groups');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allGroups = await getAllGroups();

	// Get user types for display
	const allUserTypes = await db
		.select({
			id: userTypes.id,
			name: userTypes.name,
			color: userTypes.color
		})
		.from(userTypes)
		.where(eq(userTypes.isActive, true));

	// Get all active users for member selection
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	// Map userType names to groups
	const userTypeMap = new Map(allUserTypes.map((ut) => [ut.id, ut]));
	const groupsWithUserTypes = allGroups.map((group) => ({
		...group,
		linkedUserType: group.linkedUserTypeId ? userTypeMap.get(group.linkedUserTypeId) : null
	}));

	return {
		groups: groupsWithUserTypes,
		userTypes: allUserTypes,
		users: allUsers
	};
};

export const actions: Actions = {
	createGroup: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const color = formData.get('color') as string;
		const memberIds = formData.getAll('memberIds') as string[];

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Group name is required' });
		}

		try {
			const groupId = await createCustomGroup(
				name.trim(),
				description || null,
				memberIds,
				locals.user.id,
				color || '#6B7280'
			);

			log.info({ groupId, name, createdBy: locals.user.id }, 'Custom group created');
			return { success: true, message: 'Group created successfully' };
		} catch (error) {
			log.error({ error }, 'Error creating group');
			return fail(500, { error: 'Failed to create group' });
		}
	},

	updateGroup: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const groupId = formData.get('groupId') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const color = formData.get('color') as string;
		const isActive = formData.get('isActive') === 'true';

		if (!groupId) {
			return fail(400, { error: 'Group ID is required' });
		}

		try {
			const group = await getGroup(groupId);
			if (!group) {
				return fail(404, { error: 'Group not found' });
			}

			const updates: { name?: string; description?: string | null; color?: string; isActive?: boolean } = {
				description: description || null,
				color: color || '#6B7280',
				isActive
			};

			// Only update name for custom groups
			if (!group.isAutoSynced && name) {
				updates.name = name.trim();
			}

			await updateGroup(groupId, updates);
			return { success: true, message: 'Group updated successfully' };
		} catch (error) {
			log.error({ error }, 'Error updating group');
			return fail(500, { error: 'Failed to update group' });
		}
	},

	addMember: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const groupId = formData.get('groupId') as string;
		const userId = formData.get('userId') as string;

		if (!groupId || !userId) {
			return fail(400, { error: 'Group ID and User ID are required' });
		}

		try {
			await addUserToGroup(groupId, userId, false, locals.user.id);
			return { success: true, message: 'Member added successfully' };
		} catch (error) {
			log.error({ error }, 'Error adding member');
			return fail(500, { error: 'Failed to add member' });
		}
	},

	removeMember: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const groupId = formData.get('groupId') as string;
		const userId = formData.get('userId') as string;

		if (!groupId || !userId) {
			return fail(400, { error: 'Group ID and User ID are required' });
		}

		try {
			await removeUserFromGroup(groupId, userId, false);
			return { success: true, message: 'Member removed successfully' };
		} catch (error) {
			log.error({ error }, 'Error removing member');
			return fail(500, { error: 'Failed to remove member' });
		}
	},

	syncGroups: async ({ locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		try {
			const result = await syncUserTypeGroups();
			return {
				success: true,
				message: `Sync complete: ${result.created} groups created, ${result.synced} groups updated`
			};
		} catch (error) {
			log.error({ error }, 'Error syncing groups');
			return fail(500, { error: 'Failed to sync groups' });
		}
	},

	getMembers: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const groupId = formData.get('groupId') as string;

		if (!groupId) {
			return fail(400, { error: 'Group ID is required' });
		}

		try {
			const members = await getGroupMembers(groupId);
			return { success: true, members };
		} catch (error) {
			log.error({ error }, 'Error getting members');
			return fail(500, { error: 'Failed to get members' });
		}
	}
};
