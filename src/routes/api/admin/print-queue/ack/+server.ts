import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { batchAdminAckPrintJobs } from '$lib/server/services/print-queue-service';

/**
 * POST /api/admin/print-queue/ack — manager batch-acks any vendor's jobs (store mode).
 *
 * Body: { "ids": string[], "status"?: "printed" | "failed", "failureReason"?: string }
 * Defaults to status "printed". Not vendor-scoped — any id may be acked.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	let body: { ids?: unknown; status?: string; failureReason?: string } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const ids = body.ids;
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
		return json({ error: 'ids must be a non-empty array of strings' }, { status: 400 });
	}

	const status = (body.status ?? 'printed') as 'printed' | 'failed';
	if (status !== 'printed' && status !== 'failed') {
		return json({ error: 'status must be "printed" or "failed"' }, { status: 400 });
	}

	const rows = await batchAdminAckPrintJobs(ids as string[], {
		status,
		failureReason: body.failureReason ?? null
	});
	return json({ ok: true, updated: rows.length, ids: rows.map((r) => r.id) });
};
