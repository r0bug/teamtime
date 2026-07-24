import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getAttrDefs, queryCells } from '$lib/server/floorplan/core';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';

const MAX_DATA_ROWS = 5000;

/**
 * POST /api/floorplan/:planId/render — transient color layer (spec §3.4).
 * Body: { join_key: 'vendor_id', data: [{ vendor_id: '17009', v: 9200 }, ...],
 *         style: { mode: 'ramp', from: '#2A3A46', to: '#F5B301' } }
 * Joins external keyed data to cells and returns { cells: [{x,y,color}] }.
 * NOT persisted. The floorplan never learns what 'v' means.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: { join_key?: unknown; data?: unknown; style?: { mode?: unknown; from?: unknown; to?: unknown } } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const joinKey = body.join_key;
	if (typeof joinKey !== 'string' || joinKey.length === 0) {
		return json({ error: 'join_key is required' }, { status: 400 });
	}
	const defs = defsByKey(await getAttrDefs(plan.id));
	if (Object.keys(filterAttrsByRank({ [joinKey]: '' }, defs, viewerRank(locals.user))).length === 0) {
		throw error(403, `Not permitted to render on "${joinKey}"`);
	}

	if (!Array.isArray(body.data) || body.data.length === 0) {
		return json({ error: 'data must be a non-empty array' }, { status: 400 });
	}
	if (body.data.length > MAX_DATA_ROWS) {
		return json({ error: `data exceeds ${MAX_DATA_ROWS} rows` }, { status: 400 });
	}
	const values = new Map<string, number>();
	for (const raw of body.data) {
		const row = raw as Record<string, unknown>;
		const k = row[joinKey];
		const v = row.v;
		if (typeof k !== 'string' || typeof v !== 'number' || !Number.isFinite(v)) {
			return json({ error: `data rows must be { ${joinKey}: string, v: number }` }, { status: 400 });
		}
		values.set(k, v);
	}

	const style = body.style ?? {};
	if (style.mode !== 'ramp' || !isHexColor(style.from) || !isHexColor(style.to)) {
		return json({ error: 'style must be { mode: "ramp", from: "#rrggbb", to: "#rrggbb" }' }, { status: 400 });
	}

	// Normalize v across the provided rows, lerp the ramp per matching cell.
	const nums = [...values.values()];
	const min = Math.min(...nums);
	const max = Math.max(...nums);
	const span = max - min || 1;

	const colorByValue = new Map<string, string>();
	for (const [value, v] of values) {
		colorByValue.set(value, lerpHex(style.from as string, style.to as string, (v - min) / span));
	}
	const cells: { x: number; y: number; color: string }[] = [];
	for (const cell of await queryCells(plan.id, [])) {
		const color = cell.attrs[joinKey] !== undefined ? colorByValue.get(cell.attrs[joinKey]) : undefined;
		if (color) cells.push({ x: cell.x, y: cell.y, color });
	}
	return json({ cells });
};

function isHexColor(v: unknown): v is string {
	return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function lerpHex(from: string, to: string, t: number): string {
	const f = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
	const g = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
	const mix = f.map((c, i) => Math.round(c + (g[i] - c) * t));
	return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}
