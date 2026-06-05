import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { adminAckPrintJob, PrintQueueError } from '$lib/server/services/print-queue-service';

/**
 * POST /api/admin/print-queue/:id/ack — manager acks any vendor's job (store mode).
 * Body: { "status": "printed" | "failed", "failureReason"?: string }. Empty body
 * defaults to "printed". 404 if the job id doesn't exist.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	let body: { status?: string; failureReason?: string } = {};
	try {
		body = await request.json();
	} catch {
		// empty body → defaults to printed
	}

	const status = (body.status ?? 'printed') as 'printed' | 'failed';
	if (status !== 'printed' && status !== 'failed') {
		return json({ error: 'status must be "printed" or "failed"' }, { status: 400 });
	}

	try {
		const row = await adminAckPrintJob(params.id, { status, failureReason: body.failureReason ?? null });
		return json({ ok: true, id: row.id, status: row.status });
	} catch (err) {
		if (err instanceof PrintQueueError) return json({ error: err.message }, { status: 404 });
		throw err;
	}
};
