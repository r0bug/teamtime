import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { listHistoryForVendor } from '$lib/server/services/print-queue-service';

/**
 * GET /api/vendor/print-history?q=<text>&limit=<n>
 * The calling vendor's full print history (every status), newest first. Optional
 * case-insensitive substring filter on partNumber / description. limit default
 * 100, clamped 1..500.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const q = url.searchParams.get('q')?.trim() || undefined;

	const limitRaw = url.searchParams.get('limit');
	const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;

	const jobs = await listHistoryForVendor(vendor.id, { q, limit });

	return json({
		jobs: jobs.map((j) => ({
			id: j.id,
			partNumber: j.partNumber,
			description: j.description,
			priceCents: j.priceCents,
			copies: j.copies,
			status: j.status,
			source: j.source,
			createdAt: j.createdAt,
			printedAt: j.printedAt
		}))
	});
};
