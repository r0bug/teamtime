import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { batchAckPrintJobs } from '$lib/server/services/print-queue-service';

/**
 * POST /api/vendor/print-queue/ack — batch-ack many of the vendor's jobs.
 *
 * Body: { "ids": string[], "status"?: "printed" | "failed", "failureReason"?: string }
 * Defaults to status "printed". Scoped to the authenticated vendor — ids that
 * belong to another vendor are silently ignored (not counted in `updated`).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

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

	const rows = await batchAckPrintJobs(ids as string[], vendor.id, {
		status,
		failureReason: body.failureReason ?? null
	});
	return json({ ok: true, updated: rows.length, ids: rows.map((r) => r.id) });
};
