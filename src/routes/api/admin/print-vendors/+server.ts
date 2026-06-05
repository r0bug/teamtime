import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';

/**
 * GET /api/admin/print-vendors — eligible vendors for the store/admin print
 * dropdown. Manager-gated. Same eligibility filter as /admin/tags/bulk: prefix
 * set, not NRS-inactive, not terminated.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const rows = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			prefix: vendors.inventoryCodePrefix
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

	return json({ vendors: rows });
};
