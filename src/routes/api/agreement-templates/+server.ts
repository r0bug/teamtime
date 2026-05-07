import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import {
	listTemplates,
	createTemplate,
	type ExtraField
} from '$lib/server/services/agreement-template-service';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const includeInactive = url.searchParams.get('includeInactive') === 'true';
	const includeArchived = url.searchParams.get('includeArchived') === 'true';
	const templates = await listTemplates({ includeInactive, includeArchived });
	return json({ templates });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = await request.json();
	if (!body.code || typeof body.code !== 'string') throw error(400, 'code is required');
	if (!body.title || typeof body.title !== 'string') throw error(400, 'title is required');
	if (body.kind !== 'primary' && body.kind !== 'addon') throw error(400, 'kind must be primary or addon');
	if (!body.bodyMarkdown || typeof body.bodyMarkdown !== 'string') {
		throw error(400, 'bodyMarkdown is required');
	}

	const extraFieldsSchema = validateExtraFields(body.extraFieldsSchema);

	const template = await createTemplate({
		code: body.code,
		title: body.title,
		kind: body.kind,
		bodyMarkdown: body.bodyMarkdown,
		extraFieldsSchema,
		createdByUserId: locals.user!.id
	});
	return json({ template }, { status: 201 });
};

function validateExtraFields(input: unknown): ExtraField[] | undefined {
	if (input === null || input === undefined) return undefined;
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
