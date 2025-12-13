import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, users } from '$lib/server/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { parsePacificDate, parsePacificEndOfDay, toPacificDateTimeString } from '$lib/server/utils/timezone';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const startDate = url.searchParams.get('start');
	const endDate = url.searchParams.get('end');
	const userId = url.searchParams.get('userId');
	const format = url.searchParams.get('format') || 'json';

	const conditions = [];

	// Parse dates as Pacific timezone - start at midnight, end at 23:59:59
	if (startDate) {
		conditions.push(gte(timeEntries.clockIn, parsePacificDate(startDate)));
	}

	if (endDate) {
		conditions.push(lte(timeEntries.clockIn, parsePacificEndOfDay(endDate)));
	}

	if (userId) {
		conditions.push(eq(timeEntries.userId, userId));
	}

	const entries = await db
		.select({
			id: timeEntries.id,
			userId: timeEntries.userId,
			userName: users.name,
			userEmail: users.email,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			clockInAddress: timeEntries.clockInAddress,
			clockOutAddress: timeEntries.clockOutAddress,
			notes: timeEntries.notes,
			hoursWorked: sql<number>`
				CASE
					WHEN ${timeEntries.clockOut} IS NOT NULL
					THEN EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600
					ELSE NULL
				END
			`
		})
		.from(timeEntries)
		.innerJoin(users, eq(users.id, timeEntries.userId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(timeEntries.clockIn));

	// Summary by user
	const summary = await db
		.select({
			userId: timeEntries.userId,
			userName: users.name,
			totalHours: sql<number>`
				SUM(
					CASE
						WHEN ${timeEntries.clockOut} IS NOT NULL
						THEN EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600
						ELSE 0
					END
				)
			`,
			totalEntries: sql<number>`COUNT(*)::int`
		})
		.from(timeEntries)
		.innerJoin(users, eq(users.id, timeEntries.userId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.groupBy(timeEntries.userId, users.name);

	if (format === 'csv') {
		const csvHeader = 'Employee,Email,Clock In,Clock Out,Hours,Location In,Location Out,Notes\n';
		const csvRows = entries.map(e =>
			`"${e.userName}","${e.userEmail}","${e.clockIn ? toPacificDateTimeString(e.clockIn) : ''}","${e.clockOut ? toPacificDateTimeString(e.clockOut) : ''}","${e.hoursWorked?.toFixed(2) || ''}","${e.clockInAddress || ''}","${e.clockOutAddress || ''}","${e.notes || ''}"`
		).join('\n');

		return new Response(csvHeader + csvRows, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': 'attachment; filename="time-report.csv"'
			}
		});
	}

	return json({ entries, summary });
};
