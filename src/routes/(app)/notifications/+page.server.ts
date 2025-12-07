import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, notifications } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const allNotifications = await db
		.select()
		.from(notifications)
		.where(eq(notifications.userId, locals.user.id))
		.orderBy(desc(notifications.createdAt))
		.limit(50);

	return { notifications: allNotifications };
};

export const actions: Actions = {
	markRead: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const notificationId = formData.get('notificationId')?.toString();

		if (notificationId) {
			await db
				.update(notifications)
				.set({ isRead: true, readAt: new Date() })
				.where(and(
					eq(notifications.id, notificationId),
					eq(notifications.userId, locals.user.id)
				));
		}

		return { success: true };
	},

	markAllRead: async ({ locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		await db
			.update(notifications)
			.set({ isRead: true, readAt: new Date() })
			.where(and(
				eq(notifications.userId, locals.user.id),
				eq(notifications.isRead, false)
			));

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const notificationId = formData.get('notificationId')?.toString();

		if (notificationId) {
			await db
				.delete(notifications)
				.where(and(
					eq(notifications.id, notificationId),
					eq(notifications.userId, locals.user.id)
				));
		}

		return { success: true };
	}
};
