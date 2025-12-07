import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, notifications } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

export const PUT: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [notification] = await db
		.select()
		.from(notifications)
		.where(eq(notifications.id, params.id))
		.limit(1);

	if (!notification) {
		return json({ error: 'Notification not found' }, { status: 404 });
	}

	if (notification.userId !== locals.user.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	await db
		.update(notifications)
		.set({ isRead: true, readAt: new Date() })
		.where(eq(notifications.id, params.id));

	return json({ success: true });
};
