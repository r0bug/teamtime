import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';

/**
 * GET /api/admin/print-vendors?onboarded=1 — eligible vendors for the store/admin
 * print dropdown. Manager-gated. Same eligibility filter as /admin/tags/bulk:
 * prefix set, not NRS-inactive, not terminated. With `onboarded=1`, further
 * restricts to vendors that have a linked portal user (so the label app's staff
 * mode can "act as" them); un-onboarded vendors are omitted, cueing staff to
 * finish portal onboarding.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const conds = [
		isNotNull(vendors.inventoryCodePrefix),
		eq(vendors.nrsInactive, false),
		ne(vendors.status, 'terminated')
	];
	if (url.searchParams.get('onboarded') === '1') conds.push(isNotNull(vendors.userId));

	const rows = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			prefix: vendors.inventoryCodePrefix
		})
		.from(vendors)
		.where(and(...conds))
		.orderBy(asc(vendors.displayName));

	return json({ vendors: rows });
};
