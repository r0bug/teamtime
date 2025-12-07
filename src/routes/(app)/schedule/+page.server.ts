import type { PageServerLoad } from './$types';
import { db, shifts } from '$lib/server/db';
import { eq, and, gte, lte } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;

	// Get shifts for current month and next month
	const startDate = new Date();
	startDate.setDate(1);
	startDate.setHours(0, 0, 0, 0);

	const endDate = new Date(startDate);
	endDate.setMonth(endDate.getMonth() + 2);

	const userShifts = await db.query.shifts.findMany({
		where: and(
			eq(shifts.userId, user.id),
			gte(shifts.startTime, startDate),
			lte(shifts.endTime, endDate)
		),
		orderBy: (shifts, { asc }) => [asc(shifts.startTime)],
		with: {
			location: true
		}
	});

	return {
		shifts: userShifts
	};
};
