import type { PageServerLoad } from './$types';
import { db, shifts, timeEntries, tasks, conversationParticipants, messages } from '$lib/server/db';
import { eq, and, isNull, gt, gte, lt, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const now = new Date();
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(now);
	endOfDay.setHours(23, 59, 59, 999);

	// Get next shift
	const [nextShift] = await db.query.shifts.findMany({
		where: and(
			eq(shifts.userId, user.id),
			gt(shifts.startTime, now)
		),
		orderBy: (shifts, { asc }) => [asc(shifts.startTime)],
		limit: 1,
		with: {
			location: true
		}
	});

	// Get active time entry (clocked in but not out)
	const [activeTimeEntry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(
				eq(timeEntries.userId, user.id),
				isNull(timeEntries.clockOut)
			)
		)
		.limit(1);

	// Get pending tasks count
	const [{ count: pendingTasks }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(tasks)
		.where(
			and(
				eq(tasks.assignedTo, user.id),
				eq(tasks.status, 'not_started')
			)
		);

	// Get unread messages count
	const unreadResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(conversationParticipants)
		.innerJoin(messages, eq(messages.conversationId, conversationParticipants.conversationId))
		.where(
			and(
				eq(conversationParticipants.userId, user.id),
				sql`${messages.createdAt} > COALESCE(${conversationParticipants.lastReadAt}, '1970-01-01')`
			)
		);
	const unreadMessages = unreadResult[0]?.count || 0;

	return {
		nextShift,
		activeTimeEntry,
		pendingTasks: pendingTasks || 0,
		unreadMessages
	};
};
