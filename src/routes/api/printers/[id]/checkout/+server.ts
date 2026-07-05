import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { hasTechAccess, TECH } from '$lib/server/auth/tech';
import {
	checkoutPrinter,
	returnPrinter,
	PrinterCheckoutError
} from '$lib/server/services/printer-service';

/**
 * POST   /api/printers/:id/checkout  { vendorId, loadedFormatCode }
 *   Assign a checkout printer to a vendor and record which label format is
 *   currently loaded on it ("what label is loaded"). Manager-gated.
 *
 * DELETE /api/printers/:id/checkout
 *   Return the printer to the shared pool (clears the vendor assignment).
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!hasTechAccess(locals, TECH.printers, isManager)) throw error(403, 'Forbidden');

	let body: { vendorId?: string; loadedFormatCode?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!body.vendorId) return json({ error: 'vendorId required' }, { status: 400 });
	if (!body.loadedFormatCode) {
		return json({ error: 'loadedFormatCode required (what label is loaded)' }, { status: 400 });
	}

	try {
		await checkoutPrinter(params.id, {
			vendorId: body.vendorId,
			loadedFormatCode: body.loadedFormatCode
		});
		return json({ ok: true });
	} catch (err) {
		if (err instanceof PrinterCheckoutError) return json({ error: err.message }, { status: err.status });
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!hasTechAccess(locals, TECH.printers, isManager)) throw error(403, 'Forbidden');

	try {
		await returnPrinter(params.id);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof PrinterCheckoutError) return json({ error: err.message }, { status: err.status });
		throw err;
	}
};
