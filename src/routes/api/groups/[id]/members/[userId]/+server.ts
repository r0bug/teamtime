import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import {
	getGroup,
	removeUserFromGroup,
	isGroupMember
} from '$lib/server/services/group-sync';

// DELETE /api/groups/[id]/members/[userId] - Remove member from group (admin only)
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can remove members' }, { status: 403 });
	}

	const { id, userId } = params;
	if (!id || !userId) {
		return json({ error: 'Group ID and User ID required' }, { status: 400 });
	}

	const group = await getGroup(id);
	if (!group) {
		return json({ error: 'Group not found' }, { status: 404 });
	}

	// Check if user is actually a member
	const isMember = await isGroupMember(id, userId);
	if (!isMember) {
		return json({ error: 'User is not a member of this group' }, { status: 400 });
	}

	// For auto-synced groups, warn that user will be re-added if they still have the userType
	await removeUserFromGroup(id, userId, false);

	return json({
		message: 'Member removed successfully',
		warning: group.isAutoSynced
			? 'Note: This group is auto-synced with a user type. The user will be re-added if they still have the linked user type.'
			: undefined
	});
};
