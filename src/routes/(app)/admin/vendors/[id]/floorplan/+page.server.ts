import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getVendor } from '$lib/server/services/vendor-service';
import { loadVendorFloorView } from '$lib/server/floorplan/vendor-view';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';

/** Staff-side read-only view of one vendor's booth. Edits happen on /floorplan. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!canView(locals.user)) throw redirect(302, '/dashboard');

	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');

	const rank = viewerRank(locals.user);
	const view = await loadVendorFloorView(vendor, url.searchParams.get('plan'), (attrs, defs) =>
		filterAttrsByRank(attrs, defsByKey(defs), rank)
	);
	if (view.planStatus === 'missing') throw error(404, 'Plan not found');

	return {
		vendor: {
			id: vendor.id,
			displayName: vendor.displayName,
			nrsVendorId: vendor.nrsVendorId,
			boothNumber: vendor.boothNumber
		},
		...view
	};
};
