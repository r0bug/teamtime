import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, tasks, users, taskTemplates } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		throw redirect(302, '/tasks');
	}

	const allUsers = await db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	const templates = await db
		.select({ id: taskTemplates.id, name: taskTemplates.name, description: taskTemplates.description })
		.from(taskTemplates)
		.where(eq(taskTemplates.isActive, true))
		.orderBy(taskTemplates.name);

	return { users: allUsers, templates };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const title = formData.get('title')?.toString().trim();
		const description = formData.get('description')?.toString().trim() || null;
		const assignedTo = formData.get('assignedTo')?.toString() || null;
		const priority = formData.get('priority')?.toString() as 'low' | 'medium' | 'high' | 'urgent';
		const dueAt = formData.get('dueAt')?.toString();
		const photoRequired = formData.get('photoRequired') === 'on';
		const notesRequired = formData.get('notesRequired') === 'on';

		if (!title) {
			return fail(400, { error: 'Title is required' });
		}

		await db.insert(tasks).values({
			title,
			description,
			assignedTo,
			priority: priority || 'medium',
			dueAt: dueAt ? new Date(dueAt) : null,
			photoRequired,
			notesRequired,
			source: 'manual',
			createdBy: locals.user.id
		});

		throw redirect(302, '/tasks');
	}
};
