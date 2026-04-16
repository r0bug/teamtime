import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	listTemplates,
	createTemplate,
	type CreateTemplateInput,
	type TemplateShiftInput
} from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates');

export const GET: RequestHandler = async ({ locals }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	const templates = await listTemplates();
	return json({ templates });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	let body: Partial<CreateTemplateInput> & { shifts?: TemplateShiftInput[] };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const name = body.name?.trim();
	if (!name) {
		return json({ error: 'Template name is required' }, { status: 400 });
	}
	if (!Array.isArray(body.shifts)) {
		return json({ error: 'shifts array is required' }, { status: 400 });
	}

	try {
		const template = await createTemplate({
			name,
			description: body.description ?? null,
			isActive: body.isActive ?? true,
			setAsDefault: body.setAsDefault ?? false,
			effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
			effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
			shifts: body.shifts,
			createdBy: locals.user?.id ?? null
		});
		return json({ template }, { status: 201 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		log.error({ err, name }, 'Failed to create schedule template');
		return json({ error: msg }, { status: 400 });
	}
};
