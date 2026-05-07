import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getVendor, updateVendor, getVendorAgreements } from '$lib/server/services/vendor-service';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');
	const agreements = await getVendorAgreements(params.id);
	return json({ vendor, agreements });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const body = await request.json();

	const allowed: (keyof typeof body)[] = [
		'displayName', 'contactName', 'contactEmail', 'contactPhone',
		'addressLine1', 'addressLine2', 'city', 'state', 'zip',
		'boothNumber', 'monthlyRentCents', 'maxDiscountPercent',
		'status', 'startDate', 'endDate', 'notes',
		'nrsVendorId', 'userId'
	];
	const patch: Record<string, unknown> = {};
	for (const k of allowed) {
		if (k in body) patch[k as string] = body[k];
	}

	const vendor = await updateVendor(params.id, patch);
	return json({ vendor });
};
