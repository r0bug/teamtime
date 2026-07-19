import type { PageServerLoad } from './$types';
import { listPortalNewsletters } from '$lib/server/services/vendor-newsletter-service';

// Vendor gate lives in the /vendor layout.
export const load: PageServerLoad = async () => {
	const newsletters = await listPortalNewsletters();
	return {
		newsletters: newsletters.map((n) => ({
			id: n.id,
			title: n.title,
			periodStart: n.periodStart,
			periodEnd: n.periodEnd,
			sentAt: n.sentAt
		}))
	};
};
