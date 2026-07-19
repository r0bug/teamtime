import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getNewsletter, renderNewsletter } from '$lib/server/services/vendor-newsletter-service';

// Vendor gate lives in the /vendor layout. Only sent + portal-published
// newsletters are visible here — drafts stay admin-only.
export const load: PageServerLoad = async ({ params, parent }) => {
	const newsletter = await getNewsletter(params.id);
	if (!newsletter || newsletter.status !== 'sent' || !newsletter.publishToPortal)
		throw error(404, 'Newsletter not found');

	// Personal-stats blocks show the signed-in vendor's own numbers.
	const { vendor } = await parent();
	const rendered = await renderNewsletter(newsletter, 'portal', {
		personal: { nrsVendorId: vendor.nrsVendorId ?? null }
	});
	return {
		title: newsletter.title,
		sentAt: newsletter.sentAt,
		html: rendered.html
	};
};
