import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, vendors, vendorGroupMembers, vendorGroups } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import {
	setInventoryPrefix,
	setVendorGroups,
	markOnboardingComplete,
	VendorServiceError
} from '$lib/server/services/vendor-service';
import { listGroups } from '$lib/server/services/vendor-group-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	// Vendors that haven't been marked complete yet.
	const rows = await db
		.select()
		.from(vendors)
		.where(eq(vendors.onboardingComplete, false))
		.orderBy(desc(vendors.createdAt));

	const ids = rows.map((v) => v.id);
	const memberRows = ids.length
		? await db
				.select({
					vendorId: vendorGroupMembers.vendorId,
					groupId: vendorGroupMembers.groupId,
					name: vendorGroups.name,
					color: vendorGroups.color
				})
				.from(vendorGroupMembers)
				.innerJoin(vendorGroups, eq(vendorGroups.id, vendorGroupMembers.groupId))
				.where(inArray(vendorGroupMembers.vendorId, ids))
		: [];

	const groupsByVendor = new Map<string, { id: string; name: string; color: string }[]>();
	for (const m of memberRows) {
		const list = groupsByVendor.get(m.vendorId) ?? [];
		list.push({ id: m.groupId, name: m.name, color: m.color });
		groupsByVendor.set(m.vendorId, list);
	}

	const items = rows.map((v) => {
		const memberships = groupsByVendor.get(v.id) ?? [];
		const missing: string[] = [];
		if (!v.inventoryCodePrefix) missing.push('prefix');
		if (memberships.length === 0) missing.push('group');
		if (!v.portalEnabled) missing.push('portal');
		return { vendor: v, groups: memberships, groupIds: memberships.map((g) => g.id), missing };
	});

	const allGroups = await listGroups({ includeArchived: false });

	return { items, allGroups };
};

export const actions: Actions = {
	savePrefix: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const vendorId = data.get('vendorId') as string;
		const prefix = ((data.get('inventoryCodePrefix') as string) ?? '').trim();
		if (!vendorId) return fail(400, { error: 'vendorId required' });
		try {
			await setInventoryPrefix(vendorId, prefix || null);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'savePrefix', vendorId };
	},

	saveGroups: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const vendorId = data.get('vendorId') as string;
		const groupIds = data.getAll('groupId').map((v) => v.toString()).filter(Boolean);
		if (!vendorId) return fail(400, { error: 'vendorId required' });
		await setVendorGroups(vendorId, groupIds);
		return { success: 'saveGroups', vendorId };
	},

	markComplete: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const vendorId = data.get('vendorId') as string;
		if (!vendorId) return fail(400, { error: 'vendorId required' });
		await markOnboardingComplete(vendorId, true);
		return { success: 'markComplete', vendorId };
	}
};
