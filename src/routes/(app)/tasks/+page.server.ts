import type { PageServerLoad, Actions } from './$types';
import { db, tasks, taskCompletions, users } from '$lib/server/db';
import { eq, desc, or, and, ne, notExists, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	// Get total active staff count for all_staff task progress
	const [staffCountResult] = await db
		.select({ count: sql<number>`count(*)` })
		.from(users)
		.where(eq(users.isActive, true));
	const totalStaff = staffCountResult?.count || 0;

	let userTasks;

	if (isManager(user)) {
		// Managers see all tasks
		userTasks = await db.query.tasks.findMany({
			orderBy: [desc(tasks.createdAt)],
			with: {
				assignee: { columns: { id: true, name: true } },
				template: { columns: { id: true, name: true } },
				completions: { columns: { id: true, completedBy: true } }
			}
		});
	} else {
		// Non-managers see:
		// 1. Tasks assigned directly to them
		// 2. All-staff tasks that are not completed AND they haven't personally completed
		const directTasks = await db.query.tasks.findMany({
			where: eq(tasks.assignedTo, user.id),
			orderBy: [desc(tasks.createdAt)],
			with: {
				assignee: { columns: { id: true, name: true } },
				template: { columns: { id: true, name: true } },
				completions: { columns: { id: true, completedBy: true } }
			}
		});

		// Get all_staff tasks the user hasn't completed
		const allStaffTasks = await db.query.tasks.findMany({
			where: and(
				eq(tasks.assignmentType, 'all_staff'),
				ne(tasks.status, 'completed')
			),
			orderBy: [desc(tasks.createdAt)],
			with: {
				assignee: { columns: { id: true, name: true } },
				template: { columns: { id: true, name: true } },
				completions: { columns: { id: true, completedBy: true } }
			}
		});

		// Filter out all_staff tasks the user has already completed
		const filteredAllStaffTasks = allStaffTasks.filter(task =>
			!task.completions.some(c => c.completedBy === user.id)
		);

		// Combine and deduplicate (in case a task is both assigned and all_staff)
		const taskMap = new Map();
		for (const task of [...directTasks, ...filteredAllStaffTasks]) {
			if (!taskMap.has(task.id)) {
				taskMap.set(task.id, task);
			}
		}
		userTasks = Array.from(taskMap.values()).sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
	}

	// Add completion progress info to all_staff tasks
	const tasksWithProgress = userTasks.map(task => ({
		...task,
		completionCount: task.completions?.length || 0,
		totalStaff: task.assignmentType === 'all_staff' ? totalStaff : null
	}));

	return {
		tasks: tasksWithProgress,
		totalStaff
	};
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const taskId = formData.get('taskId')?.toString();

		if (!taskId) {
			return fail(400, { error: 'Task ID required' });
		}

		await db.delete(tasks).where(eq(tasks.id, taskId));

		return { success: true, deleted: true };
	}
};
