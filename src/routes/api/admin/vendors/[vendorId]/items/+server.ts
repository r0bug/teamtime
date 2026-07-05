import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendor, generatePartNumber, VendorServiceError } from '$lib/server/services/vendor-service';
import {
	submitChange,
	applyCreateViaApi,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';

/**
 * POST /api/admin/vendors/:vendorId/items — staff create-a-tag for a chosen vendor.
 *
 * Manager-gated admin twin of POST /api/vendor/items, but targets an explicit
 * vendorId instead of the caller's own vendor: auto-generates the part number,
 * queues the create, and auto-applies it to NRS. Does NOT enqueue a print job —
 * staff print immediately client-side via the admin tag-zpl endpoint.
 *
 * Body: { description: string, priceDollars: number, quantity?: int, categoryId?: int }
 * Returns { partNumber, applied: true } on success, or 502 { error, applied: false }
 * if the NRS apply fails.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const { isManager } = await import('$lib/server/auth/roles');
	const { hasTechAccess, TECH } = await import('$lib/server/auth/tech');
	if (!hasTechAccess(locals, TECH.printQueue, isManager)) throw error(403, 'Forbidden');

	const vendor = await getVendor(params.vendorId);
	if (!vendor) throw error(404, 'Vendor not found');

	let body: {
		description?: string;
		priceDollars?: number | string;
		quantity?: number | string;
		categoryId?: number | string;
	} = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const description = (body.description ?? '').toString().trim();
	if (!description) return json({ error: 'description is required' }, { status: 400 });

	const priceNum =
		typeof body.priceDollars === 'number' ? body.priceDollars : parseFloat(String(body.priceDollars));
	if (!isFinite(priceNum)) return json({ error: 'priceDollars is required' }, { status: 400 });
	const priceCents = Math.round(priceNum * 100);

	let quantity: number | undefined = undefined;
	if (body.quantity !== undefined && body.quantity !== null && body.quantity !== '') {
		const q = parseInt(String(body.quantity), 10);
		if (isFinite(q)) quantity = q;
	}
	let categoryId: number | undefined = undefined;
	if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
		const c = parseInt(String(body.categoryId), 10);
		if (isFinite(c)) categoryId = c;
	}

	let partNumber: string;
	try {
		partNumber = await generatePartNumber(vendor.id);
	} catch (err) {
		if (err instanceof VendorServiceError) return json({ error: err.message }, { status: 400 });
		throw err;
	}

	let changeId: string;
	try {
		const row = await submitChange({
			vendorId: vendor.id,
			submittedByUserId: locals.user.id,
			changeType: 'create',
			partNumber,
			payload: {
				partName: description,
				description,
				priceCents,
				...(quantity !== undefined ? { quantity } : {}),
				...(categoryId !== undefined ? { categoryId } : {})
			},
			previousPayload: null
		});
		changeId = row.id;
	} catch (err) {
		if (err instanceof InventoryChangeError) return json({ error: err.message }, { status: 400 });
		throw err;
	}

	const apply = await applyCreateViaApi(changeId, locals.user.id);

	// NRS is the source of truth: a failed NRS create fails the whole add.
	if (!apply.applied) {
		return json(
			{ error: `Could not add to NRS: ${apply.error ?? 'unknown error'}`, applied: false },
			{ status: 502 }
		);
	}

	return json({ partNumber, applied: true });
};
