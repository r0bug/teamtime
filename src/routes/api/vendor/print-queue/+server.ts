import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { resolvePortalVendor } from '$lib/server/services/payout-group-service';
import {
	enqueuePrintJob,
	listQueuedForVendors,
	PrintQueueError
} from '$lib/server/services/print-queue-service';

/**
 * GET /api/vendor/print-queue — queued print jobs for the authenticated vendor.
 *
 * The standalone desktop label app polls this, prints each job over USB, then
 * acks it via POST /api/vendor/print-queue/:id/ack. ZPL is fetched separately
 * from GET /api/vendor/tag-zpl?partNumber=X&copies=N.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const portal = await resolvePortalVendor(locals.user.id, url.searchParams.get('vendorId'));
	if (!portal) throw error(403, 'Vendor portal access not enabled');
	const vendor = portal.selected;

	// A parent's queue carries its NRS pass-through children's jobs too, so the
	// desktop app prints them today; ?vendorId=<member> narrows to one queue.
	const scope = url.searchParams.get('vendorId') ? [vendor] : portal.members;
	const jobs = await listQueuedForVendors(scope.map((m) => m.id));
	const codeById = new Map(scope.map((m) => [m.id, m.inventoryCodePrefix ?? m.displayName]));

	return json({
		jobs: jobs.map((j) => ({
			id: j.id,
			vendorId: j.vendorId,
			vendorCode: codeById.get(j.vendorId) ?? null,
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

/**
 * POST /api/vendor/print-queue — enqueue print jobs for the authenticated vendor.
 *
 * Body: { items: [{ partNumber, copies?, description?, priceCents?, source? }] }
 * (a single bare item object is also accepted). Used by the desktop app's
 * Inventory "Add to queue" button and its "Restore last queue" recovery. The
 * vendor id always comes from the session, never the request.
 */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const portal = await resolvePortalVendor(locals.user.id, url.searchParams.get('vendorId'));
	if (!portal) throw error(403, 'Vendor portal access not enabled');
	const vendor = portal.selected;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const raw = (body as { items?: unknown })?.items ?? body;
	const items = Array.isArray(raw) ? raw : [raw];
	if (items.length === 0) throw error(400, 'No items to enqueue');
	if (items.length > 100) throw error(400, 'Too many items (max 100 per request)');

	// Sources this endpoint may stamp; anything else falls back to 'desktop'.
	const allowedSources = new Set(['desktop', 'desktop_inventory', 'desktop_requeue']);

	try {
		const jobs = [];
		for (const it of items) {
			const item = (it ?? {}) as Record<string, unknown>;
			const source = typeof item.source === 'string' && allowedSources.has(item.source)
				? item.source
				: 'desktop';
			jobs.push(
				await enqueuePrintJob({
					vendorId: vendor.id,
					partNumber: typeof item.partNumber === 'string' ? item.partNumber : '',
					copies: typeof item.copies === 'number' ? item.copies : undefined,
					description: typeof item.description === 'string' ? item.description : null,
					priceCents: typeof item.priceCents === 'number' ? Math.round(item.priceCents) : null,
					source,
					createdByUserId: locals.user.id
				})
			);
		}
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
		}, { status: 201 });
	} catch (e) {
		if (e instanceof PrintQueueError) throw error(400, e.message);
		throw e;
	}
};
