import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, tasks, users, taskCompletions, cashCountTaskLinks, cashCountConfigs, locations, socialMediaTaskLinks, socialMediaConfigs } from '$lib/server/db';
import { eq, sql, and } from 'drizzle-orm';
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
			assignmentType: tasks.assignmentType,
			createdAt: tasks.createdAt
		})
		.from(tasks)
		.leftJoin(users, eq(tasks.assignedTo, users.id))
		.where(eq(tasks.id, params.id))
		.limit(1);

	if (!task) {
		throw error(404, 'Task not found');
	}

	// Get total staff count for all_staff tasks
	let totalStaff = 0;
	if (task.assignmentType === 'all_staff') {
		const [staffCountResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(users)
			.where(eq(users.isActive, true));
		totalStaff = staffCountResult?.count || 0;
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

	// Get completions with user IDs for tracking
	const completions = await db
		.select({
			id: taskCompletions.id,
			completedAt: taskCompletions.completedAt,
			notes: taskCompletions.notes,
			completedBy: taskCompletions.completedBy,
			completedByName: users.name
		})
		.from(taskCompletions)
		.leftJoin(users, eq(taskCompletions.completedBy, users.id))
		.where(eq(taskCompletions.taskId, params.id));

	const allUsers = isManager(locals.user)
		? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true))
		: [];

	// Check if current user has already completed this task (for all_staff tasks)
	const userHasCompleted = completions.some(c => c.completedBy === locals.user.id);

	return {
		task,
		completions,
		users: allUsers,
		isManager: isManager(locals.user),
		cashCountConfig,
		socialMediaConfig,
		totalStaff,
		userHasCompleted
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

		// Get the task to check assignment type
		const [task] = await db
			.select({ assignmentType: tasks.assignmentType })
			.from(tasks)
			.where(eq(tasks.id, params.id))
			.limit(1);

		if (!task) {
			return fail(404, { error: 'Task not found' });
		}

		// Check if user already completed this task (for all_staff tasks)
		if (task.assignmentType === 'all_staff') {
			const existingCompletion = await db
				.select({ id: taskCompletions.id })
				.from(taskCompletions)
				.where(and(
					eq(taskCompletions.taskId, params.id),
					eq(taskCompletions.completedBy, locals.user.id)
				))
				.limit(1);

			if (existingCompletion.length > 0) {
				return fail(400, { error: 'You have already completed this task' });
			}
		}

		// Insert completion record
		await db.insert(taskCompletions).values({
			taskId: params.id,
			completedBy: locals.user.id,
			notes
		});

		// For all_staff tasks, only mark complete if all staff have completed
		if (task.assignmentType === 'all_staff') {
			// Get total active staff count
			const [staffCountResult] = await db
				.select({ count: sql<number>`count(*)` })
				.from(users)
				.where(eq(users.isActive, true));
			const totalStaff = staffCountResult?.count || 0;

			// Get completion count
			const [completionCountResult] = await db
				.select({ count: sql<number>`count(*)` })
				.from(taskCompletions)
				.where(eq(taskCompletions.taskId, params.id));
			const completionCount = completionCountResult?.count || 0;

			// Only mark complete if all staff have completed
			if (completionCount >= totalStaff) {
				await db
					.update(tasks)
					.set({ status: 'completed', updatedAt: new Date() })
					.where(eq(tasks.id, params.id));
			} else {
				// Update to in_progress if not already
				await db
					.update(tasks)
					.set({ status: 'in_progress', updatedAt: new Date() })
					.where(eq(tasks.id, params.id));
			}
		} else {
			// Individual task - mark complete immediately
			await db
				.update(tasks)
				.set({ status: 'completed', updatedAt: new Date() })
				.where(eq(tasks.id, params.id));
		}

		return { success: true, completed: true };
	},

	forceComplete: async ({ params, locals }) => {
		// Manager can force complete an all_staff task for everyone
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

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
