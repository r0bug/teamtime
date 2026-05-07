import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { syncFromNrs } from '$lib/server/services/vendor-service';

export const POST: RequestHandler = async ({ locals }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const result = await syncFromNrs();
	return json(result);
};
