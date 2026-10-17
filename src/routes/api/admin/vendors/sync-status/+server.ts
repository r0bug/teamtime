import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getNrsSyncStatus } from '$lib/server/services/vendor-service';

/** GET /api/admin/vendors/sync-status — progress of the background NRS sync (polled by Admin → Vendors). */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isManager(locals.user)) throw error(403, 'Manager role required');
	return json(await getNrsSyncStatus());
};
