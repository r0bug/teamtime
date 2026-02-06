import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users, tasks, messages, conversations } from '$lib/server/db';
import { ilike, or, eq, and, desc, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json([], { status: 401 });
	}

	const query = url.searchParams.get('q')?.trim();
	if (!query || query.length < 2) {
		return json([]);
	}

	const pattern = `%${query}%`;
	const results: Array<{ type: string; id: string; title: string; subtitle?: string; href: string }> = [];

	// Search users (managers+ can search all users, staff can search active users)
	const isManager = locals.user.role === 'admin' || locals.user.role === 'manager';

	try {
		const userResults = await db
			.select({ id: users.id, name: users.name, email: users.email, role: users.role })
			.from(users)
			.where(
				and(
					or(ilike(users.name, pattern), ilike(users.email, pattern)),
					isManager ? undefined : eq(users.isActive, true)
				)
			)
			.limit(5);

		for (const u of userResults) {
			results.push({
				type: 'user',
				id: u.id,
				title: u.name,
				subtitle: u.email,
				href: isManager ? `/admin/users/${u.id}` : `/dashboard`
			});
		}

		// Search tasks
		const taskResults = await db
			.select({ id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority })
			.from(tasks)
			.where(
				and(
					or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)),
					isManager ? undefined : eq(tasks.assignedTo, locals.user.id)
				)
			)
			.orderBy(desc(tasks.createdAt))
			.limit(5);

		for (const t of taskResults) {
			results.push({
				type: 'task',
				id: t.id,
				title: t.title,
				subtitle: `${t.status} - ${t.priority}`,
				href: `/tasks/${t.id}`
			});
		}

		// Search messages
		const messageResults = await db
			.select({
				id: messages.id,
				content: messages.content,
				conversationId: messages.conversationId,
				createdAt: messages.createdAt
			})
			.from(messages)
			.where(ilike(messages.content, pattern))
			.orderBy(desc(messages.createdAt))
			.limit(5);

		for (const m of messageResults) {
			const preview = m.content.length > 60 ? m.content.slice(0, 60) + '...' : m.content;
			results.push({
				type: 'message',
				id: m.id,
				title: preview,
				subtitle: m.createdAt ? new Date(m.createdAt).toLocaleDateString() : undefined,
				href: `/messages/${m.conversationId}`
			});
		}
	} catch {
		// Return partial results on error
	}

	return json(results);
};
