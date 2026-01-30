import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users, shifts, locations, storeHours, appSettings } from '$lib/server/db';
import { eq, and, gte, lte } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';
import { parsePacificDatetime, getPacificDateParts, toPacificDateString, parsePacificDate, parsePacificEndOfDay } from '$lib/server/utils/timezone';

const log = createLogger('admin:schedule');

interface PayPeriodConfig {
	type: 'semi-monthly' | 'bi-weekly' | 'weekly' | 'monthly';
	period1Start: number;
	period1End: number;
	period1Payday: number;
	period2Start: number;
	period2End: number;
	period2Payday: number;
}

interface PayPeriod {
	startDate: Date;
	endDate: Date;
	label: string;
	isCurrent: boolean;
}

const DEFAULT_CONFIG: PayPeriodConfig = {
	type: 'semi-monthly',
	period1Start: 26,
	period1End: 10,
	period1Payday: 1,
	period2Start: 11,
	period2End: 25,
	period2Payday: 16
};

function getCurrentPayPeriod(config: PayPeriodConfig): PayPeriod | null {
	const now = new Date();
	const day = now.getDate();
	const month = now.getMonth();
	const year = now.getFullYear();

	if (config.type === 'semi-monthly') {
		// Check if we're in period 2 (e.g., 11-25)
		if (day >= config.period2Start && day <= config.period2End) {
			return {
				startDate: new Date(year, month, config.period2Start),
				endDate: new Date(year, month, config.period2End, 23, 59, 59),
				label: `${config.period2Start}th - ${config.period2End}th`,
				isCurrent: true
			};
		}
		// Check if we're in period 1 (e.g., 26-10, crosses month)
		if (day >= config.period1Start) {
			// We're at end of month, period goes to next month
			return {
				startDate: new Date(year, month, config.period1Start),
				endDate: new Date(year, month + 1, config.period1End, 23, 59, 59),
				label: `${config.period1Start}th - ${config.period1End}th`,
				isCurrent: true
			};
		}
		if (day <= config.period1End) {
			// We're at beginning of month, period started last month
			return {
				startDate: new Date(year, month - 1, config.period1Start),
				endDate: new Date(year, month, config.period1End, 23, 59, 59),
				label: `${config.period1Start}th - ${config.period1End}th`,
				isCurrent: true
			};
		}
	}
	return null;
}

function formatShortDate(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Load pay period config
	const setting = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'pay_period_config'))
		.limit(1);

	let payPeriodConfig: PayPeriodConfig = DEFAULT_CONFIG;
	if (setting.length > 0) {
		try {
			payPeriodConfig = JSON.parse(setting[0].value);
		} catch {
			payPeriodConfig = DEFAULT_CONFIG;
		}
	}

	const currentPayPeriod = getCurrentPayPeriod(payPeriodConfig);

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

	// Get all shifts in range
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

	// Get all active users and locations for dropdowns
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	const allLocations = await db
		.select({
			id: locations.id,
			name: locations.name
		})
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	// Get store hours for all locations
	const allStoreHours = await db
		.select()
		.from(storeHours)
		.orderBy(storeHours.dayOfWeek);

	// Get all shifts within current pay period for hours calculation
	let payPeriodShifts: typeof allShifts = [];
	if (currentPayPeriod) {
		payPeriodShifts = await db
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
				gte(shifts.startTime, currentPayPeriod.startDate),
				lte(shifts.startTime, currentPayPeriod.endDate)
			))
			.orderBy(shifts.startTime);
	}

	// Calculate hours per employee for pay period
	const employeePayPeriodHours: { [userId: string]: { name: string; hours: number } } = {};
	for (const shift of payPeriodShifts) {
		if (!employeePayPeriodHours[shift.userId]) {
			employeePayPeriodHours[shift.userId] = { name: shift.userName, hours: 0 };
		}
		const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
		employeePayPeriodHours[shift.userId].hours += hours;
	}

	return {
		shifts: allShifts,
		users: allUsers,
		locations: allLocations,
		storeHours: allStoreHours,
		startDate: startDateStr,
		endDate: endDateStr,
		// Pay period data
		currentPayPeriod: currentPayPeriod ? {
			startDate: currentPayPeriod.startDate.toISOString().split('T')[0],
			endDate: currentPayPeriod.endDate.toISOString().split('T')[0],
			label: `${formatShortDate(currentPayPeriod.startDate)} - ${formatShortDate(currentPayPeriod.endDate)}`
		} : null,
		employeePayPeriodHours: Object.entries(employeePayPeriodHours).map(([userId, data]) => ({
			userId,
			name: data.name,
			hours: data.hours
		}))
	};
};

export const actions: Actions = {
	createShift: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const locationId = formData.get('locationId') as string;
		const startTime = formData.get('startTime') as string;
		const endTime = formData.get('endTime') as string;
		const notes = formData.get('notes') as string;

		if (!userId || !startTime || !endTime) {
			return fail(400, { error: 'User, start time, and end time are required' });
		}

		try {
			await db.insert(shifts).values({
				userId,
				locationId: locationId || null,
				startTime: parsePacificDatetime(startTime),
				endTime: parsePacificDatetime(endTime),
				notes: notes || null,
				createdBy: locals.user?.id
			});

			return { success: true, message: 'Shift created successfully' };
		} catch (error) {
			log.error({ error, userId, locationId, startTime, endTime }, 'Error creating shift');
			return fail(500, { error: 'Failed to create shift' });
		}
	},

	deleteShift: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const shiftId = formData.get('shiftId') as string;

		if (!shiftId) {
			return fail(400, { error: 'Shift ID required' });
		}

		try {
			await db.delete(shifts).where(eq(shifts.id, shiftId));
			return { success: true, message: 'Shift deleted successfully' };
		} catch (error) {
			log.error({ error, shiftId }, 'Error deleting shift');
			return fail(500, { error: 'Failed to delete shift' });
		}
	},

	updateShift: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const shiftId = formData.get('shiftId') as string;
		const userId = formData.get('userId') as string;
		const locationId = formData.get('locationId') as string;
		const startTime = formData.get('startTime') as string;
		const endTime = formData.get('endTime') as string;
		const notes = formData.get('notes') as string;

		if (!shiftId || !startTime || !endTime) {
			return fail(400, { error: 'Shift ID, start time, and end time are required' });
		}

		try {
			await db
				.update(shifts)
				.set({
					userId: userId || undefined,
					locationId: locationId || null,
					startTime: parsePacificDatetime(startTime),
					endTime: parsePacificDatetime(endTime),
					notes: notes || null,
					updatedAt: new Date()
				})
				.where(eq(shifts.id, shiftId));

			return { success: true, message: 'Shift updated successfully' };
		} catch (error) {
			log.error({ error, shiftId, userId, locationId, startTime, endTime }, 'Error updating shift');
			return fail(500, { error: 'Failed to update shift' });
		}
	},

	createBulkShifts: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const locationId = formData.get('locationId') as string;
		const startTime = formData.get('startTime') as string; // Time only, e.g., "09:00"
		const endTime = formData.get('endTime') as string; // Time only, e.g., "17:00"
		const notes = formData.get('notes') as string;
		const datesJson = formData.get('dates') as string;
		const repeatCount = parseInt(formData.get('repeatCount') as string, 10) || 1;

		if (!userId || !startTime || !endTime || !datesJson) {
			return fail(400, { error: 'User, start time, end time, and dates are required' });
		}

		let dates: string[];
		try {
			dates = JSON.parse(datesJson);
		} catch {
			return fail(400, { error: 'Invalid dates format' });
		}

		if (dates.length === 0) {
			return fail(400, { error: 'At least one day must be selected' });
		}

		try {
			const shiftsToCreate: {
				userId: string;
				locationId: string | null;
				startTime: Date;
				endTime: Date;
				notes: string | null;
				createdBy: string | undefined;
			}[] = [];

			// Parse start and end times
			const [startHour, startMin] = startTime.split(':').map(Number);
			const [endHour, endMin] = endTime.split(':').map(Number);

			// Create shifts for each week
			for (let week = 0; week < repeatCount; week++) {
				for (const dateStr of dates) {
					// Parse date and add weeks offset
					const [year, month, day] = dateStr.split('-').map(Number);
					const adjustedDay = day + (week * 7);

					// Create datetime-local strings and parse as Pacific
					const startDatetimeLocal = `${year}-${String(month).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}T${startTime}`;
					const endDatetimeLocal = `${year}-${String(month).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}T${endTime}`;

					const shiftStart = parsePacificDatetime(startDatetimeLocal);
					let shiftEnd = parsePacificDatetime(endDatetimeLocal);

					// Handle overnight shifts (end time before start time)
					if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
						// Add one day to end time
						shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
					}

					shiftsToCreate.push({
						userId,
						locationId: locationId || null,
						startTime: shiftStart,
						endTime: shiftEnd,
						notes: notes || null,
						createdBy: locals.user?.id
					});
				}
			}

			// Insert all shifts
			await db.insert(shifts).values(shiftsToCreate);

			return {
				success: true,
				message: `Created ${shiftsToCreate.length} shift(s) successfully`
			};
		} catch (error) {
			log.error({ error, userId, locationId, repeatCount, datesCount: dates.length }, 'Error creating bulk shifts');
			return fail(500, { error: 'Failed to create shifts' });
		}
	}
};
