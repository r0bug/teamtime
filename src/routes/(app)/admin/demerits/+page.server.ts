import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	listDemeritsForReview,
	approveDemerit,
	dismissDemerit
} from '$lib/server/services/demerit-review-service';
import {
	getAttendancePolicyConfig,
	updateAttendancePolicyConfig,
	type AttendancePolicyConfig
} from '$lib/server/services/attendance-policy-service';
import { audit } from '$lib/server/services/audit-service';

function requireManager(locals: App.Locals) {
	if (!locals.user) {
		throw redirect(302, '/login');
	}
	if (locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		throw error(403, 'Access denied');
	}
	return locals.user;
}

/** Switches a manager may flip from this page. */
const TOGGLEABLE: readonly (keyof AttendancePolicyConfig)[] = [
	'demeritsEnabled',
	'lateArrivalWarningsEnabled',
	'clockOutNagEnabled',
	'clockOutPointsPenaltyEnabled'
];

export const load: PageServerLoad = async ({ locals }) => {
	requireManager(locals);
	const [{ pending, resolved }, policy] = await Promise.all([
		listDemeritsForReview(50),
		getAttendancePolicyConfig()
	]);
	return { pending, resolved, policy };
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
	},

	togglePolicy: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const key = form.get('key')?.toString() as keyof AttendancePolicyConfig | undefined;
		const enabled = form.get('enabled') === 'true';

		if (!key || !TOGGLEABLE.includes(key)) {
			return fail(400, { error: 'Unknown attendance policy switch' });
		}

		try {
			const before = await getAttendancePolicyConfig();
			const after = await updateAttendancePolicyConfig({ [key]: enabled });

			// Turning automated discipline back on is exactly the kind of change
			// someone will want to trace later.
			await audit({
				userId: user.id,
				action: 'update',
				entityType: 'attendance_policy',
				entityId: key,
				beforeData: { [key]: before[key] },
				afterData: { [key]: after[key] }
			});

			return { success: true, message: `Setting ${enabled ? 'enabled' : 'disabled'}.` };
		} catch (err) {
			return fail(500, {
				error: err instanceof Error ? err.message : 'Failed to update attendance policy'
			});
		}
	}
};
