import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import {
	getGroup,
	getGroupMembers,
	addUserToGroup,
	isGroupMember
} from '$lib/server/services/group-sync';

// GET /api/groups/[id]/members - Get group members
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'Group ID required' }, { status: 400 });
	}

	const group = await getGroup(id);
	if (!group) {
		return json({ error: 'Group not found' }, { status: 404 });
	}

	// Check if user is member or admin
	const isMember = await isGroupMember(id, locals.user.id);
	if (!isMember && !isAdmin(locals.user)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const members = await getGroupMembers(id);
	return json({ members });
};

// POST /api/groups/[id]/members - Add member to group (admin only)
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can add members' }, { status: 403 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'Group ID required' }, { status: 400 });
	}

	const group = await getGroup(id);
	if (!group) {
		return json({ error: 'Group not found' }, { status: 404 });
	}

	const body = await request.json();
	const { userId, role } = body;

	if (!userId || typeof userId !== 'string') {
		return json({ error: 'User ID is required' }, { status: 400 });
	}

	// Check if already a member
	const isMember = await isGroupMember(id, userId);
	if (isMember) {
		return json({ error: 'User is already a member of this group' }, { status: 400 });
	}

	await addUserToGroup(
		id,
		userId,
		false, // not auto-assigned
		locals.user.id,
		role === 'admin' ? 'admin' : 'member'
	);

	return json({ message: 'Member added successfully' }, { status: 201 });
};
