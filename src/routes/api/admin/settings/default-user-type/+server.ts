// API: Default user type setting
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { getDefaultUserTypeId, setDefaultUserTypeId } from '$lib/server/security/migrate-users';

// GET - Get default user type
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		const defaultUserTypeId = await getDefaultUserTypeId();
		return json({
			success: true,
			defaultUserTypeId
		});
	} catch (error) {
		console.error('[API] Get default user type error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Set default user type
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { userTypeId } = body;

		await setDefaultUserTypeId(userTypeId || null, locals.user.id);

		console.log(`[API] Default user type set to ${userTypeId || 'null'} by ${locals.user.email}`);

		return json({
			success: true,
			defaultUserTypeId: userTypeId || null
		});
	} catch (error) {
		console.error('[API] Set default user type error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
