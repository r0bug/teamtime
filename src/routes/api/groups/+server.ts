import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import {
	getUserGroups,
	getAllGroups,
	createCustomGroup,
	syncUserTypeGroups
} from '$lib/server/services/group-sync';

// GET /api/groups - List groups the user is a member of (or all groups for admin)
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const all = url.searchParams.get('all') === 'true';

	// Admin can fetch all groups
	if (all && isAdmin(locals.user)) {
		const groups = await getAllGroups();
		return json({ groups });
	}

	// Regular users only see groups they're members of
	const groups = await getUserGroups(locals.user.id);
	return json({ groups });
};

// POST /api/groups - Create a custom group (admin only)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can create groups' }, { status: 403 });
	}

	const body = await request.json();
	const { name, description, memberIds, color } = body;

	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		return json({ error: 'Group name is required' }, { status: 400 });
	}

	if (!memberIds || !Array.isArray(memberIds)) {
		return json({ error: 'Member IDs must be an array' }, { status: 400 });
	}

	const groupId = await createCustomGroup(
		name.trim(),
		description || null,
		memberIds,
		locals.user.id,
		color || '#6B7280'
	);

	return json({ groupId, message: 'Group created successfully' }, { status: 201 });
};
