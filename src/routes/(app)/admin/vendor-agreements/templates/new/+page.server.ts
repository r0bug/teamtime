import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { createTemplate, type ExtraField } from '$lib/server/services/agreement-template-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const code = (data.get('code') as string)?.trim();
		const title = (data.get('title') as string)?.trim();
		const kind = data.get('kind') as string;
		const bodyMarkdown = (data.get('bodyMarkdown') as string) ?? '';

		if (!code || !title || !bodyMarkdown) {
			return fail(400, { error: 'code, title, and body are required', code, title, kind, bodyMarkdown });
		}
		if (kind !== 'primary' && kind !== 'addon') {
			return fail(400, { error: 'kind must be primary or addon', code, title, kind, bodyMarkdown });
		}

		const extraFields = parseExtraFields(data);

		const template = await createTemplate({
			code,
			title,
			kind,
			bodyMarkdown,
			extraFieldsSchema: extraFields.length ? extraFields : undefined,
			createdByUserId: locals.user!.id
		});

		throw redirect(303, `/admin/vendor-agreements/templates/${template.id}`);
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
