import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	getTemplate,
	updateTemplate,
	archiveTemplate,
	type ExtraField
} from '$lib/server/services/agreement-template-service';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const t = await getTemplate(params.id);
	if (!t) throw error(404, 'Template not found');
	return json({ template: t });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const body = await request.json();

	const patch: Parameters<typeof updateTemplate>[1] = {};
	if (typeof body.title === 'string') patch.title = body.title;
	if (typeof body.bodyMarkdown === 'string') patch.bodyMarkdown = body.bodyMarkdown;
	if ('extraFieldsSchema' in body) {
		patch.extraFieldsSchema = body.extraFieldsSchema === null ? null : validateExtraFields(body.extraFieldsSchema);
	}

	const template = await updateTemplate(params.id, patch, locals.user!.id);
	return json({ template });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	await archiveTemplate(params.id);
	return json({ success: true });
};

function validateExtraFields(input: unknown): ExtraField[] {
	if (!Array.isArray(input)) throw error(400, 'extraFieldsSchema must be an array');
	const out: ExtraField[] = [];
	for (const item of input) {
		if (typeof item !== 'object' || item === null) throw error(400, 'extraFieldsSchema entries must be objects');
		const f = item as Record<string, unknown>;
		if (typeof f.key !== 'string' || !f.key) throw error(400, 'extraFieldsSchema entry needs a key');
		if (typeof f.label !== 'string' || !f.label) throw error(400, 'extraFieldsSchema entry needs a label');
		if (f.type !== 'currency' && f.type !== 'text' && f.type !== 'number') {
			throw error(400, 'extraFieldsSchema type must be currency, text, or number');
		}
		out.push({ key: f.key, label: f.label, type: f.type, required: f.required === true });
	}
	return out;
}
