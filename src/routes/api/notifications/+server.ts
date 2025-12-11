import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, notifications } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';

// Get notifications
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const unreadOnly = url.searchParams.get('unread') === 'true';
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);

	const conditions = [eq(notifications.userId, locals.user.id)];
	if (unreadOnly) {
		conditions.push(eq(notifications.isRead, false));
	}

	const notificationList = await db
		.select()
		.from(notifications)
		.where(and(...conditions))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);

	return json({ notifications: notificationList });
};
