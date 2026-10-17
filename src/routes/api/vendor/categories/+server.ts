import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { listVendorCategories } from '$lib/server/services/vendor-categories-service';
import { resolvePortalVendor } from '$lib/server/services/payout-group-service';

/**
 * GET /api/vendor/categories — NRS inventory categories for the desktop app's
 * category dropdown. Cached server-side; returns { categories: [{id,name}] }.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const portal = await resolvePortalVendor(locals.user.id, url.searchParams.get('vendorId'));
	if (!portal) throw error(403, 'Vendor portal access not enabled');
	const vendor = portal.selected;
	const categories = await listVendorCategories();
	return json({ categories });
};
