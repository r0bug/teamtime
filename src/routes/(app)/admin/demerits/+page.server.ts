import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	listDemeritsForReview,
	approveDemerit,
	dismissDemerit
} from '$lib/server/services/demerit-review-service';

function requireManager(locals: App.Locals) {
	if (!locals.user) {
		throw redirect(302, '/login');
	}
	if (locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		throw error(403, 'Access denied');
	}
	return locals.user;
}

export const load: PageServerLoad = async ({ locals }) => {
	requireManager(locals);
	const { pending, resolved } = await listDemeritsForReview(50);
	return { pending, resolved };
};

export const actions: Actions = {
	approve: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const demeritId = form.get('demeritId')?.toString();
		if (!demeritId) return fail(400, { error: 'Missing demerit ID' });

		try {
			await approveDemerit(demeritId, user.id);
			return { success: true, message: 'Demerit approved — points deducted and employee notified.' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to approve demerit' });
		}
	},

	dismiss: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const demeritId = form.get('demeritId')?.toString();
		const reason = form.get('reason')?.toString() || undefined;
		if (!demeritId) return fail(400, { error: 'Missing demerit ID' });

		try {
			await dismissDemerit(demeritId, user.id, reason);
			return { success: true, message: 'Demerit dismissed — nothing was sent or deducted.' };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to dismiss demerit' });
		}
	}
};
