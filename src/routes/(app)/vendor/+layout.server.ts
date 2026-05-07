import type { LayoutServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) {
		// Either not a vendor portal user or portal access has been disabled.
		// The parent (app)/+layout.server.ts already filters non-vendor users
		// away from /vendor; this is the safety net for portal-disabled cases.
		throw error(403, 'Vendor portal access is not enabled for your account');
	}

	return { vendor };
};
