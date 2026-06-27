import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listQueuedAcrossVendors } from '$lib/server/services/print-queue-service';
import { listPrinters } from '$lib/server/services/printer-service';

// Staff-only: the (app) layout already redirects vendor-portal users away from
// any non-/vendor route, so a logged-in user here is staff.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/dashboard');

	const [waitingToPrint, printers] = await Promise.all([
		listQueuedAcrossVendors(),
		listPrinters()
	]);

	return { waitingToPrint, printers };
};
