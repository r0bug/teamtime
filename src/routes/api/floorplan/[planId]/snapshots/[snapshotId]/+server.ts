import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getPlan, recomputeCountCache } from '$lib/server/floorplan/core';
import { restoreSnapshot, deleteSnapshot } from '$lib/server/floorplan/snapshots';
import { canBuild } from '$lib/server/floorplan/permissions';

// Keys whose changes push totals to the count cache (spec §3.3) — must match
// the cells route.
const SUBSCRIBED_KEYS = ['vendor_id'];

/**
 * POST — restore this snapshot, replacing the plan's entire cell state.
 * An 'auto' backup of the pre-restore state is captured first, so a restore
 * can always be undone by restoring that backup.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const result = await restoreSnapshot(plan.id, params.snapshotId, locals.user.id);
	if (!result) throw error(404, 'Snapshot not found');

	// Measurement flows up: totals, never deltas (spec §3.3).
	for (const key of SUBSCRIBED_KEYS) {
		if (result.changedKeys.has(key)) await recomputeCountCache(plan.id, key);
	}

	return json({ ok: true, restored: result.restored, backupId: result.backupId });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canBuild(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	if (!(await deleteSnapshot(plan.id, params.snapshotId))) throw error(404, 'Snapshot not found');
	return json({ ok: true });
};
