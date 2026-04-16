import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	commitApplication,
	planApplication,
	type ApplicationPlan,
	type ConflictDecision
} from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:commit-apply');

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	let body: {
		startDate?: string;
		endDate?: string;
		decisions?: Record<string, ConflictDecision>;
		plan?: ApplicationPlan;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const decisions = body.decisions ?? {};

	try {
		// Re-run the planner server-side rather than trust a client-sent plan — prevents
		// stale/mutated plan replays creating unintended shifts.
		const { startDate, endDate } = body;
		if (!startDate || !endDate) {
			return json({ error: 'startDate and endDate are required' }, { status: 400 });
		}
		const plan = await planApplication({
			templateId: params.id,
			startDate,
			endDate
		});

		const result = await commitApplication(plan, decisions, locals.user?.id ?? null);
		return json({ result, plan });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.toLowerCase().includes('not found')) {
			return json({ error: msg }, { status: 404 });
		}
		log.error({ err, id: params.id }, 'Failed to commit template application');
		return json({ error: msg }, { status: 500 });
	}
};
