import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import {
	listTemplates,
	createTemplate,
	updateTemplate,
	deleteTemplate,
	setDefaultTemplate,
	type TemplateShiftInput
} from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:schedule-templates');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const [templates, activeUsers, allLocations] = await Promise.all([
		listTemplates(),
		db
			.select({ id: users.id, name: users.name, role: users.role })
			.from(users)
			.where(eq(users.isActive, true))
			.orderBy(users.name),
		db.select({ id: locations.id, name: locations.name }).from(locations).orderBy(locations.name)
	]);

	return { templates, users: activeUsers, locations: allLocations };
};

function parseShifts(payload: string): TemplateShiftInput[] {
	const parsed = JSON.parse(payload);
	if (!Array.isArray(parsed)) throw new Error('shifts must be an array');
	return parsed as TemplateShiftInput[];
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const name = (fd.get('name') as string)?.trim();
		const description = (fd.get('description') as string)?.trim() || null;
		const setAsDefault = fd.get('setAsDefault') === 'on';
		const shiftsPayload = fd.get('shifts') as string;
		if (!name) return fail(400, { error: 'Name is required' });
		if (!shiftsPayload) return fail(400, { error: 'shifts payload required' });
		try {
			const shifts = parseShifts(shiftsPayload);
			const template = await createTemplate({
				name,
				description,
				setAsDefault,
				shifts,
				createdBy: locals.user?.id ?? null
			});
			return { success: true, message: `Created template "${template.name}"` };
		} catch (err) {
			log.error({ err, name }, 'Create template failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to create template' });
		}
	},

	update: async ({ request, locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const id = fd.get('id') as string;
		const name = (fd.get('name') as string)?.trim();
		const description = (fd.get('description') as string)?.trim() || null;
		const shiftsPayload = fd.get('shifts') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			const shifts = shiftsPayload ? parseShifts(shiftsPayload) : undefined;
			await updateTemplate(id, { name, description, shifts });
			return { success: true, message: 'Template updated' };
		} catch (err) {
			log.error({ err, id }, 'Update template failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to update' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const id = fd.get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			await deleteTemplate(id);
			return { success: true, message: 'Template deleted' };
		} catch (err) {
			log.error({ err, id }, 'Delete template failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete' });
		}
	},

	setDefault: async ({ request, locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Forbidden' });
		const fd = await request.formData();
		const id = fd.get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			await setDefaultTemplate(id);
			return { success: true, message: 'Default template updated' };
		} catch (err) {
			log.error({ err, id }, 'Set default failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Failed' });
		}
	}
};
