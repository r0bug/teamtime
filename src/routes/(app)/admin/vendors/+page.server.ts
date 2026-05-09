import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db, vendors as vendorsTable } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import {
	listVendors,
	syncFromNrs,
	removeUnusedVendorStubs,
	importVendorsFromCsv,
	VendorServiceError
} from '$lib/server/services/vendor-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const status = url.searchParams.get('status') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const includeNrsInactive = url.searchParams.get('showInactive') === '1';

	const filters: Parameters<typeof listVendors>[0] = { includeNrsInactive };
	if (status === 'active' || status === 'inactive' || status === 'terminated') filters.status = status;
	if (search) filters.search = search;

	const vendors = await listVendors(filters);

	const [{ count: needsOnboardingCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.onboardingComplete, false));

	const [{ count: nrsInactiveCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(vendorsTable)
		.where(eq(vendorsTable.nrsInactive, true));

	return {
		vendors,
		filters: { status, search, includeNrsInactive },
		nrsInactiveCount,
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
	},

	removeStubs: async ({ locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		try {
			const result = await removeUnusedVendorStubs();
			return { stubsResult: result };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Cleanup failed' });
		}
	},

	importCsv: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const csv = ((data.get('csv') as string) ?? '').trim();
		if (!csv) return fail(400, { error: 'Paste the CSV content first' });
		try {
			const result = await importVendorsFromCsv(csv);
			return { csvResult: result };
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			return fail(500, { error: err instanceof Error ? err.message : 'CSV import failed' });
		}
	}
};
