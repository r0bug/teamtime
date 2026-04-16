import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { validateRange } from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:validate');

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

	try {
		const report = await validateRange({ templateId: params.id, startDate, endDate });
		return json({ report });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.toLowerCase().includes('not found')) {
			return json({ error: msg }, { status: 404 });
		}
		log.error({ err, id: params.id }, 'Failed to validate schedule against template');
		return json({ error: msg }, { status: 500 });
	}
};
