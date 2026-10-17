import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { ackPrintJob, PrintQueueError } from '$lib/server/services/print-queue-service';
import { resolvePortalVendor } from '$lib/server/services/payout-group-service';

/**
 * POST /api/vendor/print-queue/:id/ack — mark a job printed (or failed).
 *
 * Body: { "status": "printed" | "failed", "failureReason"?: string }
 * An empty body defaults to status "printed". Scoped to the authenticated
 * vendor — a job belonging to another vendor returns 404.
 */
export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const portal = await resolvePortalVendor(locals.user.id, url.searchParams.get('vendorId'));
	if (!portal) throw error(403, 'Vendor portal access not enabled');
	const vendor = portal.selected;

	let body: { status?: string; failureReason?: string } = {};
	try {
		body = await request.json();
	} catch {
		// Empty/invalid body is allowed — defaults to "printed".
	}

	const status = (body.status ?? 'printed') as 'printed' | 'failed';
	if (status !== 'printed' && status !== 'failed') {
		return json({ error: 'status must be "printed" or "failed"' }, { status: 400 });
	}

	try {
		const row = await ackPrintJob(params.id, portal.members.map((m) => m.id), {
			status,
			failureReason: body.failureReason ?? null
		});
		return json({ ok: true, id: row.id, status: row.status });
	} catch (err) {
		if (err instanceof PrintQueueError) return json({ error: err.message }, { status: 404 });
		throw err;
	}
};
