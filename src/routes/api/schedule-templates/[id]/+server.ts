import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	getTemplate,
	updateTemplate,
	deleteTemplate,
	type UpdateTemplateInput
} from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:id');

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	const template = await getTemplate(params.id);
	if (!template) {
		return json({ error: 'Template not found' }, { status: 404 });
	}
	return json({ template });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	let body: UpdateTemplateInput & { effectiveFrom?: string | null; effectiveTo?: string | null };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		const patch: UpdateTemplateInput = {};
		if (body.name !== undefined) patch.name = body.name;
		if (body.description !== undefined) patch.description = body.description;
		if (body.isActive !== undefined) patch.isActive = body.isActive;
		if (body.effectiveFrom !== undefined) {
			patch.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
		}
		if (body.effectiveTo !== undefined) {
			patch.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
		}
		if (body.shifts !== undefined) patch.shifts = body.shifts;

		const template = await updateTemplate(params.id, patch);
		return json({ template });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		log.error({ err, id: params.id }, 'Failed to update schedule template');
		return json({ error: msg }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	try {
		await deleteTemplate(params.id);
		return json({ success: true });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.toLowerCase().includes('cannot delete the default')) {
			return json({ error: msg }, { status: 409 });
		}
		if (msg.toLowerCase().includes('not found')) {
			return json({ error: msg }, { status: 404 });
		}
		log.error({ err, id: params.id }, 'Failed to delete schedule template');
		return json({ error: msg }, { status: 500 });
	}
};
