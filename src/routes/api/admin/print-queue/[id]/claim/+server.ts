import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { claimPrintJob } from '$lib/server/services/print-queue-service';

/**
 * POST /api/admin/print-queue/:id/claim — atomically lease a queued job
 * (queued → claimed) before the store prints it, so a vendor's home app and the
 * store can't both print the same tag. Manager-gated.
 *
 * 200 { ok: true, id, status: "claimed" } on a win; 409 { ok: false } if the job
 * was already claimed/printed (someone else got it) or doesn't exist.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const row = await claimPrintJob(params.id);
	if (!row) {
		return json({ ok: false, error: 'Job is not available to claim' }, { status: 409 });
	}
	return json({ ok: true, id: row.id, status: row.status });
};
