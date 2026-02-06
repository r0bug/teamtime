import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users } from '$lib/server/db';
import { inArray } from 'drizzle-orm';

// POST - Bulk user operations (admin only)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not authenticated');
	if (locals.user.role !== 'admin') throw error(403, 'Admin only');

	const { action, userIds, data } = await request.json();

	if (!Array.isArray(userIds) || userIds.length === 0) {
		throw error(400, 'userIds must be a non-empty array');
	}

	if (userIds.length > 100) {
		throw error(400, 'Maximum 100 users per bulk operation');
	}

	// Prevent operations on own account
	if (userIds.includes(locals.user.id)) {
		throw error(400, 'Cannot perform bulk operations on your own account');
	}

	const now = new Date();

	switch (action) {
		case 'activate':
			await db
				.update(users)
				.set({ isActive: true, updatedAt: now })
				.where(inArray(users.id, userIds));
			break;

		case 'deactivate':
			await db
				.update(users)
				.set({ isActive: false, updatedAt: now })
				.where(inArray(users.id, userIds));
			break;

		case 'change_role':
			if (!data?.role || !['staff', 'purchaser', 'manager', 'admin'].includes(data.role)) {
				throw error(400, 'data.role must be staff, purchaser, manager, or admin');
			}
			await db
				.update(users)
				.set({ role: data.role, updatedAt: now })
				.where(inArray(users.id, userIds));
			break;

		default:
			throw error(400, `Unknown action: ${action}. Valid: activate, deactivate, change_role`);
	}

	return json({ success: true, updated: userIds.length });
};
