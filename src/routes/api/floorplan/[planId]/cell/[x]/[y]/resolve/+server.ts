import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, getCellAttrs, getAttrDefs } from '$lib/server/floorplan/core';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';
import { getConnectorsForPlan } from '$lib/server/floorplan/connectors/registry';

const CONNECTOR_TIMEOUT_MS = 3000;

/**
 * GET /api/floorplan/:planId/cell/:x/:y/resolve — hover popover payload.
 * Builder attrs (role-filtered) + each enabled connector's data for the
 * cell's join-attribute value, each source labeled. Staff-side only: the
 * connector payloads carry rent/sales. A connector error degrades to an
 * { error } entry for that source — never a failed request.
 */
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
	const visible = filterAttrsByRank(attrs, defs, viewerRank(locals.user));

	const sources: Record<string, unknown> = {};
	const connectors = (await getConnectorsForPlan(plan.id)).filter(
		(c) => c.impl.caps.resolve && visible[c.impl.joinAttribute] !== undefined
	);

	await Promise.all(
		connectors.map(async ({ config, impl }) => {
			const value = visible[impl.joinAttribute];
			try {
				const result = await withTimeout(impl.resolve([value]), CONNECTOR_TIMEOUT_MS);
				sources[config.label] = result[value] ?? null;
			} catch (err) {
				sources[config.label] = { error: err instanceof Error ? err.message : 'Connector failed' };
			}
		})
	);

	return json({ x, y, attrs: visible, sources });
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))
	]);
}
