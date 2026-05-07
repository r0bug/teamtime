import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	listForReview,
	pendingCountByStatus,
	markApplied,
	reject,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';

const VALID = ['pending', 'applied', 'rejected', 'cancelled'] as const;
type Status = (typeof VALID)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const tab = (url.searchParams.get('status') as Status) ?? 'pending';
	const status: Status = (VALID as readonly string[]).includes(tab) ? tab : 'pending';

	const [rows, counts] = await Promise.all([listForReview({ status }), pendingCountByStatus()]);

	return { rows, status, counts };
};

export const actions: Actions = {
	apply: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
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

	reject: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
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
	}
};
