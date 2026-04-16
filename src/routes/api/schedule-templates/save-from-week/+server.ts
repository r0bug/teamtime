import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { saveWeekAsTemplate } from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:save-from-week');

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	let body: {
		weekStartDate?: string;
		name?: string;
		description?: string | null;
		setAsDefault?: boolean;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { weekStartDate, name } = body;
	if (!weekStartDate || !name?.trim()) {
		return json({ error: 'weekStartDate and name are required' }, { status: 400 });
	}

	try {
		const parsedDate = new Date(weekStartDate);
		if (isNaN(parsedDate.getTime())) {
			return json({ error: 'weekStartDate is not a valid date' }, { status: 400 });
		}
		const template = await saveWeekAsTemplate(parsedDate, {
			name: name.trim(),
			description: body.description ?? null,
			setAsDefault: body.setAsDefault ?? false,
			createdBy: locals.user?.id ?? null
		});
		return json({ template }, { status: 201 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		log.error({ err }, 'Failed to save week as template');
		return json({ error: msg }, { status: 500 });
	}
};
