import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { listQueuedForVendor } from '$lib/server/services/print-queue-service';

/**
 * GET /api/vendor/print-queue — queued print jobs for the authenticated vendor.
 *
 * The standalone desktop label app polls this, prints each job over USB, then
 * acks it via POST /api/vendor/print-queue/:id/ack. ZPL is fetched separately
 * from GET /api/vendor/tag-zpl?partNumber=X&copies=N.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const jobs = await listQueuedForVendor(vendor.id);

	return json({
		jobs: jobs.map((j) => ({
			id: j.id,
			partNumber: j.partNumber,
			copies: j.copies,
			description: j.description,
			priceCents: j.priceCents,
			source: j.source,
			status: j.status,
			createdAt: j.createdAt
		}))
	});
};
