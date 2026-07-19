import type { PageServerLoad } from './$types';
import { isoDateString, listPortalNewsletters } from '$lib/server/services/vendor-newsletter-service';

// Vendor gate lives in the /vendor layout.
export const load: PageServerLoad = async () => {
	const newsletters = await listPortalNewsletters();
	return {
		newsletters: newsletters.map((n) => ({
			id: n.id,
			title: n.title,
			// date columns arrive as JS Dates from postgres-js — send strings.
			periodStart: isoDateString(n.periodStart),
			periodEnd: isoDateString(n.periodEnd),
			sentAt: n.sentAt
		}))
	};
};
