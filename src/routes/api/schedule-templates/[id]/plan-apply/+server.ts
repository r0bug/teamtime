import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { planApplication } from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:plan-apply');

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	let body: { startDate?: string; endDate?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { startDate, endDate } = body;
	if (!startDate || !endDate) {
		return json({ error: 'startDate and endDate are required (YYYY-MM-DD)' }, { status: 400 });
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
		return json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 });
	}

	try {
		const plan = await planApplication({ templateId: params.id, startDate, endDate });
		return json({ plan });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.toLowerCase().includes('not found')) {
			return json({ error: msg }, { status: 404 });
		}
		log.error({ err, id: params.id }, 'Failed to plan template application');
		return json({ error: msg }, { status: 500 });
	}
};
