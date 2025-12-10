import type { PageServerLoad } from './$types';
import { db, tasks } from '$lib/server/db';
import { eq, desc, or } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	// Admins and managers can see all tasks, others only see their own
	const where = isManager(user)
		? undefined
		: eq(tasks.assignedTo, user.id);

	const userTasks = await db.query.tasks.findMany({
		where,
		orderBy: [desc(tasks.createdAt)],
		with: {
			assignee: { columns: { id: true, name: true } },
			template: { columns: { id: true, name: true } }
		}
	});

	return {
		tasks: userTasks
	};
};
