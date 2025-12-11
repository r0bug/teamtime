import type { PageServerLoad, Actions } from './$types';
import { redirect, fail, error } from '@sveltejs/kit';
import { db, taskTemplates, taskAssignmentRules, locations } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const template = await db
		.select()
		.from(taskTemplates)
		.where(eq(taskTemplates.id, params.id))
		.limit(1);

	if (!template[0]) {
		throw error(404, 'Template not found');
	}

	const allLocations = await db
		.select({
			id: locations.id,
			name: locations.name
		})
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	// Get rules using this template
	const rules = await db
		.select({
			id: taskAssignmentRules.id,
			name: taskAssignmentRules.name,
			triggerType: taskAssignmentRules.triggerType,
			isActive: taskAssignmentRules.isActive
		})
		.from(taskAssignmentRules)
		.where(eq(taskAssignmentRules.templateId, params.id))
		.orderBy(desc(taskAssignmentRules.createdAt));

	return {
		template: template[0],
		locations: allLocations,
		rules
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const photoRequired = formData.get('photoRequired') === 'on';
		const notesRequired = formData.get('notesRequired') === 'on';
		const locationId = formData.get('locationId') as string || null;
		const triggerEvent = formData.get('triggerEvent') as string || null;
		const stepsJson = formData.get('steps') as string;
		const isActive = formData.get('isActive') === 'on';

		if (!name?.trim()) {
			return fail(400, { error: 'Template name is required' });
		}

		let steps = null;
		if (stepsJson && stepsJson !== 'null') {
			try {
				steps = JSON.parse(stepsJson);
			} catch {
				// Ignore invalid JSON
			}
		}

		let triggerConditions = null;
		if (triggerEvent) {
			const timeWindowStart = formData.get('timeWindowStart') as string;
			const timeWindowEnd = formData.get('timeWindowEnd') as string;
			triggerConditions = {
				locationId: locationId || undefined,
				timeWindowStart: timeWindowStart || undefined,
				timeWindowEnd: timeWindowEnd || undefined
			};
		}

		try {
			await db
				.update(taskTemplates)
				.set({
					name: name.trim(),
					description: description?.trim() || null,
					photoRequired,
					notesRequired,
					locationId: locationId || null,
					triggerEvent: triggerEvent as 'clock_in' | 'clock_out' | 'first_clock_in' | 'last_clock_out' | null,
					triggerConditions,
					steps,
					isActive,
					updatedAt: new Date()
				})
				.where(eq(taskTemplates.id, params.id));

			return { success: true, message: 'Template updated successfully' };
		} catch (error) {
			console.error('Error updating template:', error);
			return fail(500, { error: 'Failed to update template' });
		}
	},

	delete: async ({ locals, params }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		try {
			await db.delete(taskTemplates).where(eq(taskTemplates.id, params.id));
			throw redirect(302, '/admin/tasks/templates');
		} catch (error) {
			if (error instanceof Response) throw error;
			console.error('Error deleting template:', error);
			return fail(500, { error: 'Failed to delete template' });
		}
	}
};
