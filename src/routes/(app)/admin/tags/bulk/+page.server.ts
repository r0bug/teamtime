import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { listFormats } from '$lib/server/services/label-format-service';

/**
 * Staff bulk tag designer. Lets a non-vendor user create labels for many
 * vendors in one sitting: pick a vendor per row, type description + price,
 * and the server hands out part numbers via the same daily-counter that the
 * vendor portal uses. The result is a printable Avery sheet and a per-vendor
 * zip of NRS Importer CSVs.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	// Only vendors that can actually receive a generated part number: prefix
	// must be set, vendor isn't terminated, isn't NRS-inactive.
	const eligible = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			inventoryCodePrefix: vendors.inventoryCodePrefix
		})
		.from(vendors)
		.where(
			and(
				isNotNull(vendors.inventoryCodePrefix),
				eq(vendors.nrsInactive, false),
				ne(vendors.status, 'terminated')
			)
		)
		.orderBy(asc(vendors.displayName));

	const formats = await listFormats({ includeInactive: false });

	return {
		vendors: eligible,
		formats,
		defaultFormatCode: 'avery_5160'
	};
};
