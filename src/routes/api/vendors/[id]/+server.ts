import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin, isManager } from '$lib/server/auth/roles';
import { getVendor, updateVendor, getVendorAgreements } from '$lib/server/services/vendor-service';
import { audit } from '$lib/server/services/audit-service';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');
	const agreements = await getVendorAgreements(params.id);
	return json({ vendor, agreements });
};

// Fields a manager can edit. Identity-link fields (userId, nrsVendorId) are
// admin-only — reassigning userId grants vendor portal access to a different
// account; reassigning nrsVendorId rewires which NRS sales/payouts roll up to
// this vendor record. Both are scope-altering, not content edits.
const MANAGER_FIELDS = [
	'displayName', 'contactName', 'contactEmail', 'contactPhone',
	'addressLine1', 'addressLine2', 'city', 'state', 'zip',
	'boothNumber', 'monthlyRentCents', 'maxDiscountPercent',
	'status', 'startDate', 'endDate', 'notes'
] as const;
const ADMIN_ONLY_FIELDS = ['nrsVendorId', 'userId'] as const;

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const body = await request.json();

	const adminEdits = ADMIN_ONLY_FIELDS.filter((k) => k in body);
	if (adminEdits.length > 0 && !isAdmin(locals.user)) {
		throw error(403, `Admin role required to change: ${adminEdits.join(', ')}`);
	}

	const patch: Record<string, unknown> = {};
	for (const k of MANAGER_FIELDS) {
		if (k in body) patch[k] = body[k];
	}
	for (const k of ADMIN_ONLY_FIELDS) {
		if (k in body) patch[k] = body[k];
	}

	const before = adminEdits.length > 0 ? await getVendor(params.id) : null;
	const vendor = await updateVendor(params.id, patch);

	if (adminEdits.length > 0 && before) {
		await audit({
			userId: locals.user!.id,
			action: 'vendor.identity_reassign',
			entityType: 'vendor',
			entityId: params.id,
			beforeData: Object.fromEntries(adminEdits.map((k) => [k, (before as Record<string, unknown>)[k]])),
			afterData: Object.fromEntries(adminEdits.map((k) => [k, (vendor as Record<string, unknown>)[k]]))
		});
	}

	return json({ vendor });
};
