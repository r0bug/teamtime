import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, growPlan } from '$lib/server/floorplan/core';
import { canView, canBuild } from '$lib/server/floorplan/permissions';

/** GET /api/floorplan/:planId — plan metadata. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');
	return json({ plan });
};

/**
 * PATCH /api/floorplan/:planId — grow the canvas (Build mode, admin).
 * Body: { gridW?: number, gridH?: number }. Grow-only: void cells cost
 * nothing, so growing is free; shrinking could orphan painted cells.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');

	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: { gridW?: unknown; gridH?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const gridW = body.gridW === undefined ? plan.gridW : body.gridW;
	const gridH = body.gridH === undefined ? plan.gridH : body.gridH;
	if (
		!Number.isInteger(gridW) ||
		!Number.isInteger(gridH) ||
		(gridW as number) < plan.gridW ||
		(gridH as number) < plan.gridH ||
		(gridW as number) > 10000 ||
		(gridH as number) > 10000
	) {
		return json({ error: 'gridW/gridH must be integers >= current size (grow-only)' }, { status: 400 });
	}

	const updated = await growPlan(plan.id, gridW as number, gridH as number);
	return json({ plan: updated });
};
