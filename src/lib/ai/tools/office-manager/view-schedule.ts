/**
 * @module AI/Tools/ViewSchedule
 * @description AI tool for viewing scheduled shifts for staff members.
 *
 * Returns a comprehensive view of the schedule including:
 * - Shifts organized by date
 * - Current clock-in status for each staff member
 * - Location information
 * - Multi-day range support via endDate parameter
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for all date operations.
 * Date strings (YYYY-MM-DD) are parsed at noon Pacific to avoid boundary issues.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 */
import { db, users, shifts, locations, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { toPacificDateString, toPacificTimeString, getPacificDayBounds } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:view-schedule');

interface ViewScheduleParams {
	date?: string; // ISO date string (YYYY-MM-DD), defaults to today
	endDate?: string; // Optional end date for viewing a range (YYYY-MM-DD)
	locationId?: string; // Optional location filter
	includeTomorrow?: boolean; // Also include tomorrow's schedule (legacy, use endDate instead)
}

interface ShiftInfo {
	shiftId: string;
	userName: string;
	userId: string;
	startTime: string;
	endTime: string;
	notes: string | null;
	isClockedIn: boolean;
	clockedInAt: string | null;
}

interface LocationSchedule {
	locationId: string | null;
	locationName: string;
	shifts: ShiftInfo[];
}

interface DaySchedule {
	date: string;
	dateDisplay: string;
	totalShifts: number;
	totalStaffScheduled: number;
	locations: LocationSchedule[];
}

interface ViewScheduleResult {
	success: boolean;
	date: string;
	endDate?: string;
	isRange: boolean;
	days: DaySchedule[];
	totalShifts: number;
	totalStaffScheduled: number;
	locations: LocationSchedule[]; // For single day compatibility
	tomorrowPreview?: {
		date: string;
		totalShifts: number;
		staffNames: string[];
	};
	error?: string;
}

// Helper to format time for display (Pacific timezone)
function formatTime(date: Date): string {
	return toPacificTimeString(date);
}

// Helper to format date for display (Pacific timezone)
function formatDate(dateStr: string): string {
	const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues with date-only strings
	return date.toLocaleDateString('en-US', {
		timeZone: 'America/Los_Angeles',
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});
}

export const viewScheduleTool: AITool<ViewScheduleParams, ViewScheduleResult> = {
	name: 'view_schedule',
	description: 'View the work schedule for a specific date or date range. Returns who is scheduled to work, at which locations, and their shift times. IMPORTANT: When asked about multiple days (e.g., "rest of the week", "this week", "next few days"), you MUST provide BOTH date AND endDate parameters. Use the dates from the Date Reference section in the context. Single day queries only need the date parameter.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'The start date to view schedule for (YYYY-MM-DD format). Defaults to today if not specified.'
			},
			endDate: {
				type: 'string',
				description: 'Optional end date for viewing a range (YYYY-MM-DD format). Use this to view multiple days, e.g., rest of the week. Maximum 14 days range.'
			},
			locationId: {
				type: 'string',
				description: 'Optional location ID to filter by. If not specified, shows all locations.'
			},
			includeTomorrow: {
				type: 'boolean',
				description: 'If true, also includes a preview of tomorrow\'s schedule. (Deprecated: use endDate instead for multi-day views)'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false, // Read-only, no confirmation needed

	// No cooldown for read-only queries

	validate(params: ViewScheduleParams) {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

		if (params.date) {
			if (!dateRegex.test(params.date)) {
				return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
			}
			const targetDate = new Date(params.date);
			if (targetDate < thirtyDaysAgo) {
				return { valid: false, error: 'Cannot view schedule more than 30 days in the past' };
			}
			if (targetDate > sixtyDaysFromNow) {
				return { valid: false, error: 'Cannot view schedule more than 60 days in the future' };
			}
		}

		if (params.endDate) {
			if (!dateRegex.test(params.endDate)) {
				return { valid: false, error: 'End date must be in YYYY-MM-DD format' };
			}
			const endDate = new Date(params.endDate);
			if (endDate > sixtyDaysFromNow) {
				return { valid: false, error: 'Cannot view schedule more than 60 days in the future' };
			}

			// Check range is not too large
			const startDate = params.date ? new Date(params.date) : now;
			const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			if (daysDiff > 14) {
				return { valid: false, error: 'Maximum date range is 14 days' };
			}
			if (daysDiff < 0) {
				return { valid: false, error: 'End date must be after start date' };
			}
		}

		return { valid: true };
	},

	async execute(params: ViewScheduleParams, context: ToolExecutionContext): Promise<ViewScheduleResult> {
		try {
			// Default to today in Pacific timezone if no date specified
			const today = new Date();
			const startDateStr = params.date || toPacificDateString(today);
			const startDate = new Date(startDateStr + 'T12:00:00'); // Use noon to avoid day boundary issues

			// Determine if this is a range query
			const isRange = !!params.endDate;
			const endDateStr = params.endDate || startDateStr;
			const endDate = new Date(endDateStr + 'T12:00:00'); // Use noon to match startDate

			// Get all locations
			const allLocations = await db
				.select({
					id: locations.id,
					name: locations.name
				})
				.from(locations)
				.where(eq(locations.isActive, true));

			// Create a map of location IDs to names
			const locationMap = new Map<string | null, string>();
			locationMap.set(null, 'Unassigned');
			for (const loc of allLocations) {
				locationMap.set(loc.id, loc.name);
			}

			// Validate location if specified
			if (params.locationId) {
				const locationExists = allLocations.find(l => l.id === params.locationId);
				if (!locationExists) {
					return {
						success: false,
						date: startDateStr,
						isRange: false,
						days: [],
						totalShifts: 0,
						totalStaffScheduled: 0,
						locations: [],
						error: `Location with ID ${params.locationId} not found`
					};
				}
			}

			// Get current time entries (who is clocked in) - only relevant for today
			const openTimeEntries = await db
				.select({
					userId: timeEntries.userId,
					clockIn: timeEntries.clockIn
				})
				.from(timeEntries)
				.where(isNull(timeEntries.clockOut));

			const clockedInMap = new Map<string, Date>();
			for (const entry of openTimeEntries) {
				clockedInMap.set(entry.userId, entry.clockIn);
			}

			// Helper function to get schedule for a single day (using Pacific timezone boundaries)
			const getScheduleForDay = async (dayDate: Date): Promise<DaySchedule> => {
				// Use Pacific timezone for day boundaries
				const { start: dayStart, end: dayEnd } = getPacificDayBounds(dayDate);

				const shiftConditions = [
					lte(shifts.startTime, dayEnd),
					gte(shifts.endTime, dayStart)
				];

				if (params.locationId) {
					shiftConditions.push(eq(shifts.locationId, params.locationId));
				}

				const shiftsForDay = await db
					.select({
						id: shifts.id,
						userId: shifts.userId,
						locationId: shifts.locationId,
						startTime: shifts.startTime,
						endTime: shifts.endTime,
						notes: shifts.notes,
						userName: users.name
					})
					.from(shifts)
					.innerJoin(users, eq(shifts.userId, users.id))
					.where(and(...shiftConditions));

				// Group shifts by location
				const locationScheduleMap = new Map<string | null, ShiftInfo[]>();

				for (const shift of shiftsForDay) {
					const locationKey = shift.locationId;
					if (!locationScheduleMap.has(locationKey)) {
						locationScheduleMap.set(locationKey, []);
					}

					const clockedInAt = clockedInMap.get(shift.userId);
					const isToday = toPacificDateString(dayDate) === toPacificDateString(today);
					locationScheduleMap.get(locationKey)!.push({
						shiftId: shift.id,
						userName: shift.userName,
						userId: shift.userId,
						startTime: formatTime(shift.startTime),
						endTime: formatTime(shift.endTime),
						notes: shift.notes,
						isClockedIn: isToday && !!clockedInAt,
						clockedInAt: isToday && clockedInAt ? clockedInAt.toISOString() : null
					});
				}

				// Build location schedule array
				const locationSchedules: LocationSchedule[] = [];
				const locationIds = params.locationId
					? [params.locationId]
					: Array.from(locationScheduleMap.keys());

				for (const locId of locationIds) {
					const shiftsAtLocation = locationScheduleMap.get(locId) || [];
					shiftsAtLocation.sort((a, b) => a.startTime.localeCompare(b.startTime));

					locationSchedules.push({
						locationId: locId,
						locationName: locationMap.get(locId) || 'Unknown Location',
						shifts: shiftsAtLocation
					});
				}

				locationSchedules.sort((a, b) => {
					if (a.locationId === null) return 1;
					if (b.locationId === null) return -1;
					return a.locationName.localeCompare(b.locationName);
				});

				const uniqueStaff = new Set(shiftsForDay.map(s => s.userId));
				const dateStr = toPacificDateString(dayDate);

				return {
					date: dateStr,
					dateDisplay: formatDate(dateStr),
					totalShifts: shiftsForDay.length,
					totalStaffScheduled: uniqueStaff.size,
					locations: locationSchedules
				};
			};

			// Get schedules for all days in range
			const days: DaySchedule[] = [];
			const currentDay = new Date(startDate);

			while (currentDay <= endDate) {
				const daySchedule = await getScheduleForDay(new Date(currentDay));
				days.push(daySchedule);
				currentDay.setDate(currentDay.getDate() + 1);
			}

			// Calculate totals across all days
			let totalShifts = 0;
			const allStaffIds = new Set<string>();
			for (const day of days) {
				totalShifts += day.totalShifts;
				for (const loc of day.locations) {
					for (const shift of loc.shifts) {
						allStaffIds.add(shift.userId);
					}
				}
			}

			// For single day, also support legacy includeTomorrow
			let tomorrowPreview: ViewScheduleResult['tomorrowPreview'];
			if (!isRange && params.includeTomorrow) {
				const tomorrow = new Date(startDate);
				tomorrow.setDate(tomorrow.getDate() + 1);
				const tomorrowSchedule = await getScheduleForDay(tomorrow);

				const staffNames: string[] = [];
				for (const loc of tomorrowSchedule.locations) {
					for (const shift of loc.shifts) {
						if (!staffNames.includes(shift.userName)) {
							staffNames.push(shift.userName);
						}
					}
				}

				tomorrowPreview = {
					date: tomorrowSchedule.date,
					totalShifts: tomorrowSchedule.totalShifts,
					staffNames
				};
			}

			return {
				success: true,
				date: startDateStr,
				endDate: isRange ? endDateStr : undefined,
				isRange,
				days,
				totalShifts,
				totalStaffScheduled: allStaffIds.size,
				locations: days.length === 1 ? days[0].locations : [], // For single-day compatibility
				tomorrowPreview
			};
		} catch (error) {
			log.error('View schedule tool error', { error });
			return {
				success: false,
				date: params.date || toPacificDateString(new Date()),
				isRange: false,
				days: [],
				totalShifts: 0,
				totalStaffScheduled: 0,
				locations: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ViewScheduleResult): string {
		if (!result.success) {
			return `Failed to view schedule: ${result.error}`;
		}

		// Multi-day range format
		if (result.isRange && result.days.length > 1) {
			let output = `Schedule from ${formatDate(result.date)} to ${formatDate(result.endDate!)}:\n`;
			output += `Total: ${result.totalShifts} shift(s), ${result.totalStaffScheduled} unique staff member(s)\n\n`;

			for (const day of result.days) {
				output += `📅 ${day.dateDisplay}:\n`;

				if (day.locations.length === 0 || day.totalShifts === 0) {
					output += '   No shifts scheduled\n';
				} else {
					for (const location of day.locations) {
						if (location.shifts.length > 0) {
							output += `   📍 ${location.locationName}:\n`;
							for (const shift of location.shifts) {
								const clockedStatus = shift.isClockedIn ? ' ✓ (clocked in)' : '';
								const notes = shift.notes ? ` - ${shift.notes}` : '';
								output += `      • ${shift.userName}: ${shift.startTime} - ${shift.endTime}${clockedStatus}${notes}\n`;
							}
						}
					}
				}
				output += '\n';
			}

			return output;
		}

		// Single day format (legacy)
		const day = result.days[0];
		if (!day) {
			return 'No schedule data available.';
		}

		let output = `Schedule for ${day.dateDisplay}:\n`;
		output += `Total: ${day.totalShifts} shift(s), ${day.totalStaffScheduled} staff member(s)\n\n`;

		if (day.locations.length === 0) {
			output += 'No shifts scheduled for this date.';
		} else {
			for (const location of day.locations) {
				output += `📍 ${location.locationName}:\n`;
				if (location.shifts.length === 0) {
					output += '   No shifts\n';
				} else {
					for (const shift of location.shifts) {
						const clockedStatus = shift.isClockedIn ? ' ✓ (clocked in)' : '';
						const notes = shift.notes ? ` - ${shift.notes}` : '';
						output += `   • ${shift.userName}: ${shift.startTime} - ${shift.endTime}${clockedStatus}${notes}\n`;
					}
				}
				output += '\n';
			}
		}

		if (result.tomorrowPreview) {
			const tomorrowDisplay = formatDate(result.tomorrowPreview.date);
			output += `Tomorrow (${tomorrowDisplay}): ${result.tomorrowPreview.totalShifts} shift(s)`;
			if (result.tomorrowPreview.staffNames.length > 0) {
				output += ` - ${result.tomorrowPreview.staffNames.join(', ')}`;
			}
		}

		return output;
	}
};
