import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	getTemplate,
	updateTemplate,
	archiveTemplate,
	type ExtraField
} from '$lib/server/services/agreement-template-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	const template = await getTemplate(params.id);
	if (!template) throw error(404, 'Template not found');
	return { template };
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const title = (data.get('title') as string)?.trim();
		const bodyMarkdown = (data.get('bodyMarkdown') as string) ?? '';

		if (!title || !bodyMarkdown) return fail(400, { error: 'title and body are required' });

		const extraFields = parseExtraFields(data);

		await updateTemplate(
			params.id,
			{ title, bodyMarkdown, extraFieldsSchema: extraFields.length ? extraFields : null },
			locals.user!.id
		);
		return { success: true };
	},
	archive: async ({ locals, params }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		await archiveTemplate(params.id);
		throw redirect(303, '/admin/vendor-agreements/templates');
	}
};

function parseExtraFields(data: FormData): ExtraField[] {
	const keys = data.getAll('extra_key').map(String);
	const labels = data.getAll('extra_label').map(String);
	const types = data.getAll('extra_type').map(String);
	const requireds = data.getAll('extra_required').map(String);

	const fields: ExtraField[] = [];
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]?.trim();
		const label = labels[i]?.trim();
		if (!key || !label) continue;
		const t = types[i];
		if (t !== 'currency' && t !== 'text' && t !== 'number') continue;
		fields.push({ key, label, type: t, required: requireds[i] === 'true' });
	}
	return fields;
}
