import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getCellAttrs, getAttrDefs } from '$lib/server/floorplan/core';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';

/** GET /api/floorplan/:planId/cell/:x/:y — one cell's attrs, role-filtered. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const x = Number(params.x);
	const y = Number(params.y);
	if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= plan.gridW || y >= plan.gridH) {
		throw error(400, 'Cell coords out of range');
	}

	const attrs = await getCellAttrs(plan.id, x, y);
	const defs = defsByKey(await getAttrDefs(plan.id));
	return json({ x, y, attrs: filterAttrsByRank(attrs, defs, viewerRank(locals.user)) });
};
