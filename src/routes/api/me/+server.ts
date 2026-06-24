import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, vendorTagSettings } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { isManager } from '$lib/server/auth/roles';

/**
 * GET /api/me — identity + mode for the authenticated session.
 *
 * The standalone label app calls this right after login to choose vendor mode vs
 * store/admin mode and to pre-select the format dropdown. `vendor` is non-null
 * whenever the account has a vendor record (a staff user can also be a vendor).
 *
 * `defaultFormatCode` is the system fallback used at render time when a vendor has
 * no preference. Note it's a sheet format today — for a thermal-only dropdown,
 * prefer `vendor.preferredFormatCode` when it's thermal, else the first thermal
 * entry from GET /api/label-formats.
 */
const DEFAULT_FORMAT_CODE = 'avery_5160';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const user = locals.user;
	const vendor = await getVendorForUser(user.id);

	let vendorObj: {
		id: string;
		prefix: string | null;
		displayName: string;
		contactName: string | null;
		preferredFormatCode: string | null;
	} | null = null;

	if (vendor) {
		const [settings] = await db
			.select({ preferredFormat: vendorTagSettings.preferredFormat })
			.from(vendorTagSettings)
			.where(eq(vendorTagSettings.vendorId, vendor.id))
			.limit(1);
		vendorObj = {
			id: vendor.id,
			prefix: vendor.inventoryCodePrefix ?? null,
			displayName: vendor.displayName,
			contactName: vendor.contactName ?? null,
			preferredFormatCode: settings?.preferredFormat ?? null
		};
	}

	return json({
		userId: user.id,
		role: user.role,
		isManager: isManager(user),
		vendor: vendorObj,
		defaultFormatCode: DEFAULT_FORMAT_CODE
	});
};
