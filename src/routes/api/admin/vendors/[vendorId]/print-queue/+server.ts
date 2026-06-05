import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { listQueuedForVendor } from '$lib/server/services/print-queue-service';

/**
 * GET /api/admin/vendors/:vendorId/print-queue — a vendor's queued jobs, for
 * store/admin mode. Manager-gated. Same job shape as the vendor endpoint.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const jobs = await listQueuedForVendor(params.vendorId);

	return json({
		jobs: jobs.map((j) => ({
			id: j.id,
			vendorId: j.vendorId,
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
