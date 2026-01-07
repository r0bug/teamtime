import type { PageServerLoad } from './$types';
import { db, shifts, users, locations } from '$lib/server/db';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getPacificDateParts, toPacificDateString, parsePacificDate, parsePacificEndOfDay } from '$lib/server/utils/timezone';

export const load: PageServerLoad = async ({ locals, url }) => {
	const currentUser = locals.user!;

	// Get date range from query params or default to current week (in Pacific timezone)
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');

	const now = new Date();
	const pacificNow = getPacificDateParts(now);

	// Calculate start of week in Pacific timezone (Sunday)
	let startDateStr: string;
	if (startParam) {
		startDateStr = startParam;
	} else {
		// Get current Pacific date and find Sunday
		const daysToSubtract = pacificNow.weekday; // weekday 0 = Sunday
		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - daysToSubtract);
		startDateStr = toPacificDateString(startDate);
	}

	// Calculate end of week (7 days from start)
	let endDateStr: string;
	if (endParam) {
		endDateStr = endParam;
	} else {
		const endDate = new Date(parsePacificDate(startDateStr));
		endDate.setDate(endDate.getDate() + 7);
		endDateStr = toPacificDateString(endDate);
	}

	// Convert to proper UTC timestamps for querying
	const startOfWeek = parsePacificDate(startDateStr);
	const endOfWeek = parsePacificEndOfDay(endDateStr);

	// Get ALL shifts in range (not just current user's shifts)
	// This allows all staff to see the full schedule for coordination
	const allShifts = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			userName: users.name,
			locationId: shifts.locationId,
			locationName: locations.name,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes
		})
		.from(shifts)
		.innerJoin(users, eq(shifts.userId, users.id))
		.leftJoin(locations, eq(shifts.locationId, locations.id))
		.where(and(
			gte(shifts.startTime, startOfWeek),
			lte(shifts.startTime, endOfWeek)
		))
		.orderBy(shifts.startTime);

	// Also get the current user's upcoming shifts for the upcoming shifts section
	const upcomingShifts = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			locationId: shifts.locationId,
			locationName: locations.name,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes
		})
		.from(shifts)
		.leftJoin(locations, eq(shifts.locationId, locations.id))
		.where(and(
			eq(shifts.userId, currentUser.id),
			gte(shifts.startTime, now)
		))
		.orderBy(shifts.startTime)
		.limit(5);

	return {
		shifts: allShifts,
		myUpcomingShifts: upcomingShifts,
		currentUserId: currentUser.id,
		startDate: startDateStr,
		endDate: endDateStr
	};
};
