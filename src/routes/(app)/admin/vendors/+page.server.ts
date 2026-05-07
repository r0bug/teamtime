import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db, vendors as vendorsTable } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { listVendors, syncFromNrs } from '$lib/server/services/vendor-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const status = url.searchParams.get('status') ?? '';
	const search = url.searchParams.get('q') ?? '';

	const filters: Parameters<typeof listVendors>[0] = {};
	if (status === 'active' || status === 'inactive' || status === 'terminated') filters.status = status;
	if (search) filters.search = search;

	const vendors = await listVendors(filters);

	const [{ count: needsOnboardingCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.onboardingComplete, false));

	return {
		vendors,
		filters: { status, search },
		needsOnboardingCount
	};
};

export const actions: Actions = {
	syncNrs: async ({ locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		try {
			const result = await syncFromNrs();
			return { syncResult: result };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'NRS sync failed' });
		}
	}
};
