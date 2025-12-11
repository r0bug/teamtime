import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, taskTemplates, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:tasks:templates:new');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allLocations = await db
		.select({
			id: locations.id,
			name: locations.name
		})
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	return {
		locations: allLocations
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
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

		if (!name?.trim()) {
			return fail(400, { error: 'Template name is required' });
		}

		let steps = null;
		if (stepsJson) {
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
			const result = await db
				.insert(taskTemplates)
				.values({
					name: name.trim(),
					description: description?.trim() || null,
					photoRequired,
					notesRequired,
					locationId: locationId || null,
					triggerEvent: triggerEvent as 'clock_in' | 'clock_out' | 'first_clock_in' | 'last_clock_out' | null,
					triggerConditions,
					steps,
					isActive: true,
					createdBy: locals.user!.id
				})
				.returning({ id: taskTemplates.id });

			throw redirect(302, `/admin/tasks/templates/${result[0].id}`);
		} catch (error) {
			if (error instanceof Response) throw error;
			log.error('Error creating template', { error, name, locationId, triggerEvent });
			return fail(500, { error: 'Failed to create template' });
		}
	}
};
