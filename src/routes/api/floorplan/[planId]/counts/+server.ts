import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getCountCache } from '$lib/server/floorplan/core';
import { canView } from '$lib/server/floorplan/permissions';

/**
 * GET /api/floorplan/:planId/counts?key=vendor_id — the derived count CACHE
 * (push-updated on every write that touches the key). Fast, but explicitly
 * non-authoritative: anything contractual must pull /aggregate for truth.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const key = url.searchParams.get('key') ?? 'vendor_id';
	const rows = await getCountCache(plan.id, key);
	return json({
		authoritative: false,
		key,
		counts: Object.fromEntries(rows.map((r) => [r.value, r.cells])),
		updatedAt: rows.reduce<string | null>((latest, r) => {
			const ts = r.updatedAt?.toISOString() ?? null;
			return !latest || (ts && ts > latest) ? ts : latest;
		}, null)
	});
};
