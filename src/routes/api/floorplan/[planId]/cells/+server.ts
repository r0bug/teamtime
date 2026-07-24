import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db, vendors, floorplanCellAttrs } from '$lib/server/db';
import {
	getPlan,
	getAttrDefs,
	queryCells,
	applyOps,
	recomputeCountCache,
	type CellOp
} from '$lib/server/floorplan/core';
import {
	canView,
	canEditKey,
	viewerRank,
	filterAttrsByRank,
	defsByKey
} from '$lib/server/floorplan/permissions';

const MAX_OPS = 5000;
// Keys whose changes push totals to the count cache (spec §3.3).
const SUBSCRIBED_KEYS = ['vendor_id'];

/**
 * GET /api/floorplan/:planId/cells[?where=key:value&where=...]
 * Cells matching ALL filters (none = every painted cell), attrs role-filtered.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const filters: { key: string; value: string }[] = [];
	for (const raw of url.searchParams.getAll('where')) {
		const idx = raw.indexOf(':');
		if (idx <= 0) return json({ error: `Invalid where filter "${raw}" — expected key:value` }, { status: 400 });
		filters.push({ key: raw.slice(0, idx), value: raw.slice(idx + 1) });
	}

	const defs = defsByKey(await getAttrDefs(plan.id));
	const rank = viewerRank(locals.user);

	// Filtering on a key the viewer can't see would leak its distribution.
	for (const f of filters) {
		if (Object.keys(filterAttrsByRank({ [f.key]: f.value }, defs, rank)).length === 0) {
			throw error(403, `Not permitted to filter on "${f.key}"`);
		}
	}

	const cells = (await queryCells(plan.id, filters))
		.map((c) => ({ ...c, attrs: filterAttrsByRank(c.attrs, defs, rank) }))
		.filter((c) => Object.keys(c.attrs).length > 0);
	return json({ cells });
};

/**
 * POST /api/floorplan/:planId/cells — batch paint diff (spec §3.1).
 * Body: { ops: [{x, y, key, value | null}, ...] }
 * Per-key permission: geometry keys admin-only, operational keys any staff.
 * vendor_id values must exist in vendors.nrsVendorId and land on sellable
 * cells. Whole batch rejected on any violation.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: { ops?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!Array.isArray(body.ops) || body.ops.length === 0) {
		return json({ error: 'ops must be a non-empty array' }, { status: 400 });
	}
	if (body.ops.length > MAX_OPS) {
		return json({ error: `ops exceeds the ${MAX_OPS}-op batch limit` }, { status: 400 });
	}

	const ops: CellOp[] = [];
	for (const raw of body.ops) {
		const op = raw as Record<string, unknown>;
		if (
			!Number.isInteger(op.x) ||
			!Number.isInteger(op.y) ||
			(op.x as number) < 0 ||
			(op.y as number) < 0 ||
			(op.x as number) >= plan.gridW ||
			(op.y as number) >= plan.gridH ||
			typeof op.key !== 'string' ||
			op.key.length === 0 ||
			(op.value !== null && typeof op.value !== 'string')
		) {
			return json({ error: `Invalid op: ${JSON.stringify(raw)}` }, { status: 400 });
		}
		ops.push({ x: op.x as number, y: op.y as number, key: op.key, value: op.value as string | null });
	}

	const defs = defsByKey(await getAttrDefs(plan.id));
	const deniedKeys = [...new Set(ops.map((op) => op.key))].filter((key) => !canEditKey(locals.user, key, defs));
	if (deniedKeys.length > 0) {
		throw error(403, `Not permitted to edit key(s): ${deniedKeys.join(', ')}`);
	}

	const violations = await validateVendorOps(plan.id, ops);
	if (violations.length > 0) {
		return json({ error: 'vendor_id validation failed', violations }, { status: 400 });
	}

	const changedKeys = await applyOps(plan.id, ops);

	// Measurement flows up: totals, never deltas (spec §3.3).
	for (const key of SUBSCRIBED_KEYS) {
		if (changedKeys.has(key)) await recomputeCountCache(plan.id, key);
	}

	return json({ ok: true, applied: ops.length });
};

/**
 * Vendor-aware checks, deliberately OUTSIDE the domain-agnostic core:
 * vendor_id values must match vendors.nrsVendorId, and may only be painted on
 * cells whose effective kind is sellable (an earlier `kind` op in the same
 * batch counts — Build mode may carve + assign in one save).
 */
async function validateVendorOps(planId: string, ops: CellOp[]): Promise<string[]> {
	const vendorOps = ops.filter((op) => op.key === 'vendor_id' && op.value !== null);
	if (vendorOps.length === 0) return [];

	const violations: string[] = [];

	const wanted = [...new Set(vendorOps.map((op) => op.value as string))];
	const numeric = wanted.filter((v) => /^\d+$/.test(v)).map(Number);
	const known = new Set(
		numeric.length > 0
			? (
					await db
						.select({ nrsVendorId: vendors.nrsVendorId })
						.from(vendors)
						.where(inArray(vendors.nrsVendorId, numeric))
				).map((r) => String(r.nrsVendorId))
			: []
	);
	for (const v of wanted) {
		if (!known.has(v)) violations.push(`Unknown vendor_id "${v}" — not a vendors.nrs_vendor_id`);
	}

	// Effective kind per target cell: last kind op in this batch wins, else DB.
	const batchKind = new Map<string, string | null>();
	for (const op of ops) {
		if (op.key === 'kind') batchKind.set(`${op.x},${op.y}`, op.value);
	}
	const coords = vendorOps
		.map((op) => ({ x: op.x, y: op.y }))
		.filter((c) => !batchKind.has(`${c.x},${c.y}`));
	const dbKinds = new Map<string, string>();
	if (coords.length > 0) {
		// One filtered query over the plan's kind rows (bounded by plan size).
		const rows = await db
			.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y, value: floorplanCellAttrs.value })
			.from(floorplanCellAttrs)
			.where(and(eq(floorplanCellAttrs.planId, planId), eq(floorplanCellAttrs.key, 'kind')));
		for (const row of rows) dbKinds.set(`${row.x},${row.y}`, row.value);
	}
	for (const op of vendorOps) {
		const coord = `${op.x},${op.y}`;
		const kind = batchKind.has(coord) ? batchKind.get(coord) : dbKinds.get(coord);
		if (kind !== 'sellable') {
			violations.push(`vendor_id at (${op.x},${op.y}) requires a sellable cell (kind is ${kind ?? 'void'})`);
		}
	}
	return violations;
}
