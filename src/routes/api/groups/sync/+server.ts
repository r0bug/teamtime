import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { syncUserTypeGroups } from '$lib/server/services/group-sync';

// POST /api/groups/sync - Trigger userType sync (admin only)
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isAdmin(locals.user)) {
		return json({ error: 'Only admins can sync groups' }, { status: 403 });
	}

	const result = await syncUserTypeGroups();

	return json({
		message: 'Groups synced successfully',
		created: result.created,
		synced: result.synced
	});
};
