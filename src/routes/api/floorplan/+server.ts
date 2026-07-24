import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { listPlans } from '$lib/server/floorplan/core';
import { canView } from '$lib/server/floorplan/permissions';

/** GET /api/floorplan — list plans. Any staff-side user. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	return json({ plans: await listPlans() });
};
