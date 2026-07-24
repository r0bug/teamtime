import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getAttrDefs, upsertAttrDef } from '$lib/server/floorplan/core';
import { canView, canBuild, viewerRank, visibleDefs } from '$lib/server/floorplan/permissions';

/** GET /api/floorplan/:planId/attrs — attr defs the viewer may see (drives render/filter UI). */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const defs = visibleDefs(await getAttrDefs(plan.id), viewerRank(locals.user));
	return json({ attrs: defs });
};

const TYPES = ['enum', 'categorical', 'ordinal', 'number', 'boolean'];
const OWNERS = ['floorplan', 'teamtime', 'nrs'];
const VISIBILITIES = ['public', 'staff', 'admin'];

/** POST /api/floorplan/:planId/attrs — upsert an attr def (Build mode, admin). */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: Record<string, unknown> = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (typeof body.key !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(body.key)) {
		return json({ error: 'key must be snake_case, starting with a letter' }, { status: 400 });
	}
	if (typeof body.type !== 'string' || !TYPES.includes(body.type)) {
		return json({ error: `type must be one of ${TYPES.join(', ')}` }, { status: 400 });
	}
	const ownerSystem = (body.ownerSystem ?? 'floorplan') as string;
	if (!OWNERS.includes(ownerSystem)) {
		return json({ error: `ownerSystem must be one of ${OWNERS.join(', ')}` }, { status: 400 });
	}
	const visibility = (body.visibility ?? 'public') as string;
	if (!VISIBILITIES.includes(visibility)) {
		return json({ error: `visibility must be one of ${VISIBILITIES.join(', ')}` }, { status: 400 });
	}
	const renderHint = body.renderHint ?? null;
	if (renderHint !== null && (typeof renderHint !== 'object' || Array.isArray(renderHint))) {
		return json({ error: 'renderHint must be an object or null' }, { status: 400 });
	}

	await upsertAttrDef(plan.id, {
		key: body.key,
		type: body.type,
		ownerSystem,
		visibility,
		renderHint: renderHint as Record<string, unknown> | null
	});
	return json({ ok: true });
};
