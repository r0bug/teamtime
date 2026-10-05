import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
	listForReview,
	pendingCountByStatus,
	markApplied,
	reject,
	autoApplyPendingCreatesViaApi,
	applyPendingChange,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';

const VALID = ['pending', 'applied', 'rejected', 'cancelled'] as const;
type Status = (typeof VALID)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/dashboard');

	const tab = (url.searchParams.get('status') as Status) ?? 'pending';
	const status: Status = (VALID as readonly string[]).includes(tab) ? tab : 'pending';

	const [rows, counts] = await Promise.all([listForReview({ status }), pendingCountByStatus()]);

	return { rows, status, counts };
};

export const actions: Actions = {
	apply: async ({ locals, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const changeId = data.get('id') as string;
		const notes = ((data.get('nrsApplyNotes') as string) ?? '').trim() || undefined;
		if (!changeId) return fail(400, { error: 'id required' });
		try {
			await markApplied({ changeId, appliedByUserId: locals.user!.id, nrsApplyNotes: notes });
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'apply' };
	},

	// Re-drive a failed change through the live NRS write path (create/update/
	// deactivate), rather than just marking it applied by hand.
	retry: async ({ locals, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const changeId = (await request.formData()).get('id') as string;
		if (!changeId) return fail(400, { error: 'id required' });
		try {
			const result = await applyPendingChange(changeId, locals.user!.id);
			if (!result.applied) {
				return fail(502, { error: `NRS still refused it: ${result.error ?? 'unknown error'}` });
			}
			return { success: 'retry' };
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}
	},

	reject: async ({ locals, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const changeId = data.get('id') as string;
		const reason = ((data.get('reason') as string) ?? '').trim();
		if (!changeId) return fail(400, { error: 'id required' });
		if (!reason) return fail(400, { error: 'Reason required' });
		try {
			await reject({ changeId, reviewedByUserId: locals.user!.id, reason });
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'reject' };
	},

	autoApply: async ({ locals, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const vendorId = ((await request.formData()).get('vendorId') as string) || undefined;
		try {
			const result = await autoApplyPendingCreatesViaApi({
				triggeredByUserId: locals.user!.id,
				vendorId
			});
			return { success: 'autoApply', apiApply: result };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Apply via NRS API failed' });
		}
	}
};
