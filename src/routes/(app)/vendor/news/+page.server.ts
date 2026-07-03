import type { PageServerLoad } from './$types';
import { listActiveAnnouncements } from '$lib/server/services/vendor-announcements-service';

// Vendor gate lives in the /vendor layout.
export const load: PageServerLoad = async () => {
	return { announcements: await listActiveAnnouncements() };
};
