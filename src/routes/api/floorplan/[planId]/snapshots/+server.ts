import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan } from '$lib/server/floorplan/core';
import { listSnapshots, createSnapshot } from '$lib/server/floorplan/snapshots';
import { canBuild } from '$lib/server/floorplan/permissions';

/**
 * Layout snapshots: save the whole floor as a named layout, restore later.
 * Build-mode tooling — restore rewrites geometry keys, so everything here is
 * admin-only, matching Build mode.
 */

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	return json({ snapshots: await listSnapshots(plan.id) });
};

/** POST — save the current layout. Body: { name } */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: { name?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (name.length < 1 || name.length > 80) {
		return json({ error: 'name must be 1-80 characters' }, { status: 400 });
	}

	const snapshot = await createSnapshot(plan.id, name, locals.user.id);
	return json({ snapshot });
};
