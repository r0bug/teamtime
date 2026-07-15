import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getAttrDefs, aggregate, aggregateValue } from '$lib/server/floorplan/core';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';

/**
 * GET /api/floorplan/:planId/aggregate?key=vendor_id[&value=SR]
 * The ONE analytical question the floorplan answers: it counts cells.
 * Without value: { value: cellCount, ... }. With value: count + bbox + centroid.
 * This endpoint is the authoritative pull; the /counts cache is the push.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const key = url.searchParams.get('key');
	if (!key) return json({ error: 'key query param is required' }, { status: 400 });

	const defs = defsByKey(await getAttrDefs(plan.id));
	if (Object.keys(filterAttrsByRank({ [key]: '' }, defs, viewerRank(locals.user))).length === 0) {
		throw error(403, `Not permitted to aggregate on "${key}"`);
	}

	const value = url.searchParams.get('value');
	if (value !== null) {
		return json(await aggregateValue(plan.id, key, value));
	}
	return json(await aggregate(plan.id, key));
};
