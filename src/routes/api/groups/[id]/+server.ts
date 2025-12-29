import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { db, groups } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import {
	getGroup,
	getGroupMembers,
	updateGroup,
	isGroupMember
} from '$lib/server/services/group-sync';

// GET /api/groups/[id] - Get group details
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

	return json({ group, members });
};

// PATCH /api/groups/[id] - Update group (admin only)
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can update groups' }, { status: 403 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'Group ID required' }, { status: 400 });
	}

	const group = await getGroup(id);
	if (!group) {
		return json({ error: 'Group not found' }, { status: 404 });
	}

	// Don't allow modifying auto-synced groups' core properties
	const body = await request.json();
	const { name, description, color, isActive } = body;

	const updates: { name?: string; description?: string | null; color?: string; isActive?: boolean } = {};

	if (name !== undefined && !group.isAutoSynced) {
		updates.name = name;
	}
	if (description !== undefined) {
		updates.description = description;
	}
	if (color !== undefined) {
		updates.color = color;
	}
	if (isActive !== undefined) {
		updates.isActive = isActive;
	}

	await updateGroup(id, updates);

	return json({ message: 'Group updated successfully' });
};

// DELETE /api/groups/[id] - Delete group (admin only, custom groups only)
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can delete groups' }, { status: 403 });
	}

	const { id } = params;
	if (!id) {
		return json({ error: 'Group ID required' }, { status: 400 });
	}

	const group = await getGroup(id);
	if (!group) {
		return json({ error: 'Group not found' }, { status: 404 });
	}

	if (group.isAutoSynced) {
		return json({ error: 'Cannot delete auto-synced groups linked to user types' }, { status: 400 });
	}

	// Delete the group (cascade will delete members and conversation)
	await db.delete(groups).where(eq(groups.id, id));

	return json({ message: 'Group deleted successfully' });
};
