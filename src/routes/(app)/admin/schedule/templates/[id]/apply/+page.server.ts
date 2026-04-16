import type { PageServerLoad, Actions } from './$types';
import { redirect, fail, error } from '@sveltejs/kit';
import { db, users, locations } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import {
	getTemplate,
	planApplication,
	commitApplication,
	type ConflictDecision
} from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:schedule-templates:apply');

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	const template = await getTemplate(params.id);
	if (!template) throw error(404, 'Template not found');

	const [allUsers, allLocations] = await Promise.all([
		db.select({ id: users.id, name: users.name }).from(users),
		db.select({ id: locations.id, name: locations.name }).from(locations)
	]);

	return {
		template,
		users: allUsers,
		locations: allLocations
	};
};

export const actions: Actions = {
	plan: async ({ request, locals, params }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const startDate = fd.get('startDate') as string;
		const endDate = fd.get('endDate') as string;
		if (!startDate || !endDate) return fail(400, { error: 'startDate and endDate required' });
		try {
			const plan = await planApplication({ templateId: params.id, startDate, endDate });
			return { success: true, plan };
		} catch (err) {
			log.error({ err, params, startDate, endDate }, 'plan failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Plan failed' });
		}
	},

	commit: async ({ request, locals, params }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const startDate = fd.get('startDate') as string;
		const endDate = fd.get('endDate') as string;
		const decisionsRaw = fd.get('decisions') as string;
		if (!startDate || !endDate) return fail(400, { error: 'startDate and endDate required' });

		let decisions: Record<string, ConflictDecision> = {};
		if (decisionsRaw) {
			try {
				decisions = JSON.parse(decisionsRaw);
			} catch {
				return fail(400, { error: 'Invalid decisions JSON' });
			}
		}

		try {
			// Re-plan server-side to ensure decisions match current DB state
			const plan = await planApplication({ templateId: params.id, startDate, endDate });
			const result = await commitApplication(plan, decisions, locals.user?.id ?? null);
			return { success: true, result, committed: true };
		} catch (err) {
			log.error({ err, params }, 'commit failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Commit failed' });
		}
	}
};
