import type { PageServerLoad } from './$types';
import { db, tasks } from '$lib/server/db';
import { eq, desc, or } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	const where = user.role === 'manager'
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
