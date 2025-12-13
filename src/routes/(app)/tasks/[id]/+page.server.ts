import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, tasks, users, taskCompletions, cashCountTaskLinks, cashCountConfigs, locations, socialMediaTaskLinks, socialMediaConfigs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { parsePacificDatetime } from '$lib/server/utils/timezone';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const [task] = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			description: tasks.description,
			priority: tasks.priority,
			status: tasks.status,
			dueAt: tasks.dueAt,
			photoRequired: tasks.photoRequired,
			notesRequired: tasks.notesRequired,
			assignedTo: tasks.assignedTo,
			assigneeName: users.name,
			createdAt: tasks.createdAt
		})
		.from(tasks)
		.leftJoin(users, eq(tasks.assignedTo, users.id))
		.where(eq(tasks.id, params.id))
		.limit(1);

	if (!task) {
		throw error(404, 'Task not found');
	}

	// Check if this is a cash count task
	const cashCountLink = await db
		.select({
			configId: cashCountTaskLinks.configId,
			locationId: cashCountTaskLinks.locationId,
			configName: cashCountConfigs.name,
			locationName: locations.name,
			fields: cashCountConfigs.fields
		})
		.from(cashCountTaskLinks)
		.leftJoin(cashCountConfigs, eq(cashCountTaskLinks.configId, cashCountConfigs.id))
		.leftJoin(locations, eq(cashCountTaskLinks.locationId, locations.id))
		.where(eq(cashCountTaskLinks.taskId, params.id))
		.limit(1);

	const cashCountConfig = cashCountLink.length > 0 ? cashCountLink[0] : null;

	// Check if this is a social media metrics task
	const socialMediaLink = await db
		.select({
			configId: socialMediaTaskLinks.configId,
			postUrl: socialMediaTaskLinks.postUrl,
			configName: socialMediaConfigs.name,
			platform: socialMediaConfigs.platform,
			fields: socialMediaConfigs.fields,
			requireUrl: socialMediaConfigs.requireUrl,
			requireScreenshot: socialMediaConfigs.requireScreenshot
		})
		.from(socialMediaTaskLinks)
		.leftJoin(socialMediaConfigs, eq(socialMediaTaskLinks.configId, socialMediaConfigs.id))
		.where(eq(socialMediaTaskLinks.taskId, params.id))
		.limit(1);

	const socialMediaConfig = socialMediaLink.length > 0 ? socialMediaLink[0] : null;

	const completions = await db
		.select({
			id: taskCompletions.id,
			completedAt: taskCompletions.completedAt,
			notes: taskCompletions.notes,
			completedByName: users.name
		})
		.from(taskCompletions)
		.leftJoin(users, eq(taskCompletions.completedBy, users.id))
		.where(eq(taskCompletions.taskId, params.id));

	const allUsers = isManager(locals.user)
		? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true))
		: [];

	return {
		task,
		completions,
		users: allUsers,
		isManager: isManager(locals.user),
		cashCountConfig,
		socialMediaConfig
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const title = formData.get('title')?.toString().trim();
		const description = formData.get('description')?.toString().trim() || null;
		const assignedTo = formData.get('assignedTo')?.toString() || null;
		const priority = formData.get('priority')?.toString() as 'low' | 'medium' | 'high' | 'urgent';
		const status = formData.get('status')?.toString() as 'not_started' | 'in_progress' | 'completed' | 'cancelled';
		const dueAt = formData.get('dueAt')?.toString();

		if (!title) {
			return fail(400, { error: 'Title is required' });
		}

		await db
			.update(tasks)
			.set({
				title,
				description,
				assignedTo,
				priority,
				status,
				dueAt: dueAt ? parsePacificDatetime(dueAt) : null,
				updatedAt: new Date()
			})
			.where(eq(tasks.id, params.id));

		return { success: true };
	},

	complete: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const notes = formData.get('notes')?.toString() || null;

		await db.insert(taskCompletions).values({
			taskId: params.id,
			completedBy: locals.user.id,
			notes
		});

		await db
			.update(tasks)
			.set({ status: 'completed', updatedAt: new Date() })
			.where(eq(tasks.id, params.id));

		return { success: true, completed: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		await db.delete(tasks).where(eq(tasks.id, params.id));

		throw redirect(302, '/tasks');
	}
};
