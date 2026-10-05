import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db, shifts, users, locations, shiftRequests } from '$lib/server/db';
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm';
import { createCoverageRequest } from '$lib/server/services/shift-coverage-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('schedule:coverage');
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

	// This user's own coverage requests, so they can see what happened after
	// they asked. Terminal ones are included but capped.
	const myRequests = await db
		.select({
			id: shiftRequests.id,
			status: shiftRequests.status,
			requestType: shiftRequests.requestType,
			startTime: shiftRequests.startTime,
			endTime: shiftRequests.endTime,
			claimCode: shiftRequests.claimCode,
			filledBy: shiftRequests.filledBy,
			shiftId: shiftRequests.shiftId
		})
		.from(shiftRequests)
		.where(eq(shiftRequests.requestedBy, currentUser.id))
		.orderBy(desc(shiftRequests.createdAt))
		.limit(10);

	const filledByIds = myRequests.map((r) => r.filledBy).filter((id): id is string => !!id);
	const filledNames = filledByIds.length
		? await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(inArray(users.id, filledByIds))
		: [];
	const nameMap = new Map(filledNames.map((u) => [u.id, u.name]));

	// Shifts that already have a live request can't be requested again.
	const lockedShiftIds = new Set(
		myRequests
			.filter((r) => r.status === 'open' || r.status === 'pending_approval')
			.map((r) => r.shiftId)
			.filter((id): id is string => !!id)
	);

	return {
		shifts: allShifts,
		myUpcomingShifts: upcomingShifts,
		currentUserId: currentUser.id,
		startDate: startDateStr,
		endDate: endDateStr,
		myRequests: myRequests.map((r) => ({
			...r,
			filledByName: r.filledBy ? (nameMap.get(r.filledBy) ?? 'Someone') : null
		})),
		lockedShiftIds: [...lockedShiftIds]
	};
};

export const actions: Actions = {
	requestCoverage: async ({ locals, request }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Not signed in' });

		const form = await request.formData();
		const shiftId = form.get('shiftId')?.toString();
		const requestType = form.get('requestType')?.toString();
		const reason = form.get('reason')?.toString()?.trim();

		if (!shiftId) return fail(400, { error: 'Pick which shift you need covered' });
		if (!requestType || !['sick', 'personal', 'appointment', 'trade'].includes(requestType)) {
			return fail(400, { error: 'Pick a reason' });
		}

		try {
			await createCoverageRequest({
				shiftId,
				requestedBy: user.id,
				createdBy: user.id,
				requestType: requestType as 'sick' | 'personal' | 'appointment' | 'trade',
				reason: reason || undefined
			});
			return {
				success: true,
				message: "Sent. A manager will review and text the team — you'll hear when someone picks it up."
			};
		} catch (err) {
			log.warn({ err, userId: user.id, shiftId }, 'Coverage request failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Could not submit that request' });
		}
	}
};
