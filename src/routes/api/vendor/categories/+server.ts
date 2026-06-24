import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { listVendorCategories } from '$lib/server/services/vendor-categories-service';

/**
 * GET /api/vendor/categories — NRS inventory categories for the desktop app's
 * category dropdown. Cached server-side; returns { categories: [{id,name}] }.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');
	const categories = await listVendorCategories();
	return json({ categories });
};
