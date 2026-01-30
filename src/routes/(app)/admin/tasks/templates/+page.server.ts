import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, taskTemplates, taskAssignmentRules, locations, users } from '$lib/server/db';
import { eq, sql, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:tasks:templates');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get all templates with rule counts and location info
	const templates = await db
		.select({
			id: taskTemplates.id,
			name: taskTemplates.name,
			description: taskTemplates.description,
			photoRequired: taskTemplates.photoRequired,
			notesRequired: taskTemplates.notesRequired,
			triggerEvent: taskTemplates.triggerEvent,
			isActive: taskTemplates.isActive,
			locationId: taskTemplates.locationId,
			locationName: locations.name,
			createdAt: taskTemplates.createdAt,
			updatedAt: taskTemplates.updatedAt,
			ruleCount: sql<number>`(
				SELECT count(*)
				FROM task_assignment_rules
				WHERE template_id = ${taskTemplates.id}
			)`
		})
		.from(taskTemplates)
		.leftJoin(locations, eq(taskTemplates.locationId, locations.id))
		.orderBy(desc(taskTemplates.updatedAt));

	return {
		templates
	};
};

export const actions: Actions = {
	toggleActive: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const templateId = formData.get('templateId') as string;
		const isActive = formData.get('isActive') === 'true';

		if (!templateId) {
			return fail(400, { error: 'Template ID is required' });
		}

		try {
			await db
				.update(taskTemplates)
				.set({
					isActive,
					updatedAt: new Date()
				})
				.where(eq(taskTemplates.id, templateId));

			return { success: true, message: `Template ${isActive ? 'activated' : 'deactivated'}` };
		} catch (error) {
			log.error({ error, templateId, isActive }, 'Error toggling template');
			return fail(500, { error: 'Failed to update template' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const templateId = formData.get('templateId') as string;

		if (!templateId) {
			return fail(400, { error: 'Template ID is required' });
		}

		try {
			// Check if template has rules - warn user
			const rules = await db
				.select({ count: sql<number>`count(*)` })
				.from(taskAssignmentRules)
				.where(eq(taskAssignmentRules.templateId, templateId));

			if (rules[0]?.count > 0) {
				// Rules will be cascade deleted with the template
			}

			await db.delete(taskTemplates).where(eq(taskTemplates.id, templateId));

			return { success: true, message: 'Template deleted' };
		} catch (error) {
			log.error({ error, templateId }, 'Error deleting template');
			return fail(500, { error: 'Failed to delete template' });
		}
	}
};
