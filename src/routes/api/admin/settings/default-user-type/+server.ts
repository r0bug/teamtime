// API: Default user type setting
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { getDefaultUserTypeId, setDefaultUserTypeId } from '$lib/server/security/migrate-users';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:admin:default-user-type');

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
		log.error({ error, userId: locals.user?.id }, 'Get default user type error');
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

		log.info({ userTypeId, userId: locals.user.id, email: locals.user.email }, 'Default user type set');

		return json({
			success: true,
			defaultUserTypeId: userTypeId || null
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Set default user type error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
