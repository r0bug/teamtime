import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendor } from '$lib/server/services/vendor-service';
import { assertThermalFormat, renderVendorTagZpl, TagZplError } from '$lib/server/services/tag-zpl-service';

/**
 * GET /api/admin/vendors/:vendorId/tag-zpl?partNumber=X&copies=N&format=CODE
 * Manager-gated admin variant of the vendor tag-zpl endpoint — renders ZPL for a
 * given vendor's part number (store/admin mode). The vendor endpoint is scoped to
 * the caller's own prefix; this one takes an explicit vendorId behind the manager
 * gate and validates the part number belongs to that vendor's prefix.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const { isManager } = await import('$lib/server/auth/roles');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const partNumber = url.searchParams.get('partNumber')?.trim();
	if (!partNumber) throw error(400, 'partNumber required');

	const copiesRaw = url.searchParams.get('copies');
	let copies: number | undefined = undefined;
	if (copiesRaw !== null) {
		if (!/^\d+$/.test(copiesRaw)) {
			return json({ error: 'copies must be a positive integer' }, { status: 400 });
		}
		copies = parseInt(copiesRaw, 10);
	}

	const formatCode = url.searchParams.get('format')?.trim() || undefined;

	const vendor = await getVendor(params.vendorId);
	if (!vendor) throw error(404, 'Vendor not found');
	const prefix = vendor.inventoryCodePrefix ?? '';
	if (!prefix) throw error(409, 'Vendor has no inventory code prefix configured');
	if (!partNumber.startsWith(prefix)) {
		throw error(400, 'Part number does not belong to this vendor');
	}

	try {
		await assertThermalFormat(formatCode);
		const zpl = await renderVendorTagZpl(vendor, partNumber, { copies, formatCode });
		return new Response(zpl, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		if (err instanceof TagZplError) return json({ error: err.message }, { status: err.status });
		throw err;
	}
};
