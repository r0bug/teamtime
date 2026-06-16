import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, users } from '$lib/server/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { parsePacificDate, parsePacificEndOfDay, toPacificDateTimeString } from '$lib/server/utils/timezone';
import { paidHoursByEntry } from '$lib/server/utils/break-allowance';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isManager(locals.user)) {
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

	const rawEntries = await db
		.select({
			id: timeEntries.id,
			userId: timeEntries.userId,
			userName: users.name,
			userEmail: users.email,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			clockInAddress: timeEntries.clockInAddress,
			clockOutAddress: timeEntries.clockOutAddress,
			notes: timeEntries.notes
		})
		.from(timeEntries)
		.innerJoin(users, eq(users.id, timeEntries.userId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(timeEntries.clockIn));

	// Paid hours per entry, with the break allowance applied (unpaid break time deducted)
	const paidHours = await paidHoursByEntry(rawEntries);
	const entries = rawEntries.map((e) => ({
		...e,
		hoursWorked: e.clockOut ? (paidHours.get(e.id) ?? 0) : null
	}));

	// Summary by user
	const summaryMap = new Map<string, { userId: string; userName: string; totalHours: number; totalEntries: number }>();
	for (const e of entries) {
		let s = summaryMap.get(e.userId);
		if (!s) {
			s = { userId: e.userId, userName: e.userName, totalHours: 0, totalEntries: 0 };
			summaryMap.set(e.userId, s);
		}
		s.totalHours += e.hoursWorked ?? 0;
		s.totalEntries += 1;
	}
	const summary = Array.from(summaryMap.values()).map((s) => ({
		...s,
		totalHours: Math.round(s.totalHours * 100) / 100
	}));

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
