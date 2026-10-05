import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadVendorFloorView, portalAttrFilter } from '$lib/server/floorplan/vendor-view';

/**
 * Vendor portal: "where is my booth". The vendor gets the building outline
 * (kind/door only) plus their own booth and pool cells — never other
 * vendors' ids, labels, or zones. The parent layout already resolved the
 * vendor and enforced portal access.
 */
export const load: PageServerLoad = async ({ parent, url }) => {
	const { vendor } = await parent();
	const view = await loadVendorFloorView(vendor, url.searchParams.get('plan'), portalAttrFilter);
	if (view.planStatus === 'missing') throw error(404, 'Plan not found');
	return view;
};
