import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, vendors, vendorAgreements } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { marked } from 'marked';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const [vendor] = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			contactName: vendors.contactName,
			contactEmail: vendors.contactEmail,
			contactPhone: vendors.contactPhone,
			addressLine1: vendors.addressLine1,
			addressLine2: vendors.addressLine2,
			city: vendors.city,
			state: vendors.state,
			zip: vendors.zip,
			startDate: vendors.startDate
		})
		.from(vendors)
		.where(eq(vendors.id, params.id))
		.limit(1);
	if (!vendor) throw error(404, 'Vendor not found');

	const [agreement] = await db
		.select()
		.from(vendorAgreements)
		.where(and(eq(vendorAgreements.id, params.agreementId), eq(vendorAgreements.vendorId, params.id)))
		.limit(1);
	if (!agreement) throw error(404, 'Agreement not found');

	// Render the frozen body snapshot (markdown) to HTML for print.
	const bodyHtml = await marked.parse(agreement.bodySnapshot, { async: true });

	return { vendor, agreement, bodyHtml };
};
