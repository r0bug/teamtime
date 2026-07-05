import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendor } from '$lib/server/services/vendor-service';
import { recordStaffPrintedJob } from '$lib/server/services/print-queue-service';

/**
 * POST /api/admin/vendors/:vendorId/print-jobs/record — record a staff
 * client-side print against the vendor so their history is complete.
 *
 * Manager-gated. Body: { partNumber: string, copies?: number,
 * description?: string|null, priceCents?: number|null }. partNumber required.
 * Returns { ok: true, jobId }.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const { isManager } = await import('$lib/server/auth/roles');
	const { hasTechAccess, TECH } = await import('$lib/server/auth/tech');
	if (!hasTechAccess(locals, TECH.printQueue, isManager)) throw error(403, 'Forbidden');

	const vendor = await getVendor(params.vendorId);
	if (!vendor) throw error(404, 'Vendor not found');

	let body: {
		partNumber?: unknown;
		copies?: unknown;
		description?: unknown;
		priceCents?: unknown;
	} = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const partNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : '';
	if (!partNumber) return json({ error: 'partNumber is required' }, { status: 400 });

	let copies: number | undefined = undefined;
	if (body.copies !== undefined && body.copies !== null && body.copies !== '') {
		const c = parseInt(String(body.copies), 10);
		if (isFinite(c)) copies = c;
	}

	const description = typeof body.description === 'string' ? body.description : null;
	const priceCents = typeof body.priceCents === 'number' ? body.priceCents : null;

	const row = await recordStaffPrintedJob({
		vendorId: vendor.id,
		partNumber,
		copies,
		description,
		priceCents,
		createdByUserId: locals.user.id
	});

	return json({ ok: true, jobId: row.id });
};
