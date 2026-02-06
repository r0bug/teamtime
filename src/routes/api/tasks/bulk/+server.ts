import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks } from '$lib/server/db';
import { inArray } from 'drizzle-orm';

// POST - Bulk task operations
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const isManager = locals.user.role === 'admin' || locals.user.role === 'manager';
	if (!isManager) throw error(403, 'Only managers can perform bulk operations');

	const { action, taskIds, data } = await request.json();

	if (!Array.isArray(taskIds) || taskIds.length === 0) {
		throw error(400, 'taskIds must be a non-empty array');
	}

	if (taskIds.length > 100) {
		throw error(400, 'Maximum 100 tasks per bulk operation');
	}

	const now = new Date();
	let updated = 0;

	switch (action) {
		case 'complete':
			const result1 = await db
				.update(tasks)
				.set({ status: 'completed', updatedAt: now })
				.where(inArray(tasks.id, taskIds));
			updated = taskIds.length;
			break;

		case 'cancel':
			await db
				.update(tasks)
				.set({ status: 'cancelled', updatedAt: now })
				.where(inArray(tasks.id, taskIds));
			updated = taskIds.length;
			break;

		case 'assign':
			if (!data?.assignedTo) throw error(400, 'data.assignedTo is required for assign action');
			await db
				.update(tasks)
				.set({ assignedTo: data.assignedTo, updatedAt: now })
				.where(inArray(tasks.id, taskIds));
			updated = taskIds.length;
			break;

		case 'set_priority':
			if (!data?.priority) throw error(400, 'data.priority is required');
			await db
				.update(tasks)
				.set({ priority: data.priority, updatedAt: now })
				.where(inArray(tasks.id, taskIds));
			updated = taskIds.length;
			break;

		default:
			throw error(400, `Unknown action: ${action}. Valid: complete, cancel, assign, set_priority`);
	}

	return json({ success: true, updated });
};
