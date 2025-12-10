// View Schedule Tool - Read-only query for viewing the schedule
import { db, users, shifts, locations, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';

interface ViewScheduleParams {
	date?: string; // ISO date string (YYYY-MM-DD), defaults to today
	locationId?: string; // Optional location filter
	includeTomorrow?: boolean; // Also include tomorrow's schedule
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

interface ViewScheduleResult {
	success: boolean;
	date: string;
	totalShifts: number;
	totalStaffScheduled: number;
	locations: LocationSchedule[];
	tomorrowPreview?: {
		date: string;
		totalShifts: number;
		staffNames: string[];
	};
	error?: string;
}

// Helper to format time for display
function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

// Helper to format date for display
function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});
}

export const viewScheduleTool: AITool<ViewScheduleParams, ViewScheduleResult> = {
	name: 'view_schedule',
	description: 'View the work schedule for a specific date. Returns who is scheduled to work, at which locations, and their shift times. Use this to understand staffing levels before making decisions about tasks, messages, or schedule changes.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'The date to view schedule for (YYYY-MM-DD format). Defaults to today if not specified.'
			},
			locationId: {
				type: 'string',
				description: 'Optional location ID to filter by. If not specified, shows all locations.'
			},
			includeTomorrow: {
				type: 'boolean',
				description: 'If true, also includes a preview of tomorrow\'s schedule.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false, // Read-only, no confirmation needed

	// No cooldown for read-only queries

	validate(params: ViewScheduleParams) {
		if (params.date) {
			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.date)) {
				return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
			}
			// Validate date range (not more than 30 days in past or 60 days in future)
			const targetDate = new Date(params.date);
			const now = new Date();
			const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

			if (targetDate < thirtyDaysAgo) {
				return { valid: false, error: 'Cannot view schedule more than 30 days in the past' };
			}
			if (targetDate > sixtyDaysFromNow) {
				return { valid: false, error: 'Cannot view schedule more than 60 days in the future' };
			}
		}
		return { valid: true };
	},

	async execute(params: ViewScheduleParams, context: ToolExecutionContext): Promise<ViewScheduleResult> {
		try {
			// Default to today if no date specified
			const today = new Date();
			const dateStr = params.date || today.toISOString().split('T')[0];
			const targetDate = new Date(dateStr);

			const dayStart = new Date(targetDate);
			dayStart.setHours(0, 0, 0, 0);
			const dayEnd = new Date(targetDate);
			dayEnd.setHours(23, 59, 59, 999);

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

			// Build shift query conditions
			const shiftConditions = [
				lte(shifts.startTime, dayEnd),
				gte(shifts.endTime, dayStart)
			];

			// Add location filter if specified
			if (params.locationId) {
				// Validate location exists
				const locationExists = allLocations.find(l => l.id === params.locationId);
				if (!locationExists) {
					return {
						success: false,
						date: dateStr,
						totalShifts: 0,
						totalStaffScheduled: 0,
						locations: [],
						error: `Location with ID ${params.locationId} not found`
					};
				}
				shiftConditions.push(eq(shifts.locationId, params.locationId));
			}

			// Get shifts for the day with user info
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

			// Get current time entries (who is clocked in)
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

			// Group shifts by location
			const locationScheduleMap = new Map<string | null, ShiftInfo[]>();

			for (const shift of shiftsForDay) {
				const locationKey = shift.locationId;
				if (!locationScheduleMap.has(locationKey)) {
					locationScheduleMap.set(locationKey, []);
				}

				const clockedInAt = clockedInMap.get(shift.userId);
				locationScheduleMap.get(locationKey)!.push({
					shiftId: shift.id,
					userName: shift.userName,
					userId: shift.userId,
					startTime: formatTime(shift.startTime),
					endTime: formatTime(shift.endTime),
					notes: shift.notes,
					isClockedIn: !!clockedInAt,
					clockedInAt: clockedInAt ? clockedInAt.toISOString() : null
				});
			}

			// Build location schedule array, sorted by location name
			const locationSchedules: LocationSchedule[] = [];

			// If filtering by location, only include that location
			const locationIds = params.locationId
				? [params.locationId]
				: Array.from(locationScheduleMap.keys());

			for (const locId of locationIds) {
				const shiftsAtLocation = locationScheduleMap.get(locId) || [];
				// Sort shifts by start time
				shiftsAtLocation.sort((a, b) => a.startTime.localeCompare(b.startTime));

				locationSchedules.push({
					locationId: locId,
					locationName: locationMap.get(locId) || 'Unknown Location',
					shifts: shiftsAtLocation
				});
			}

			// Sort locations by name (but keep "Unassigned" at the end)
			locationSchedules.sort((a, b) => {
				if (a.locationId === null) return 1;
				if (b.locationId === null) return -1;
				return a.locationName.localeCompare(b.locationName);
			});

			// Count unique staff scheduled
			const uniqueStaff = new Set(shiftsForDay.map(s => s.userId));

			// Optionally get tomorrow's preview
			let tomorrowPreview: ViewScheduleResult['tomorrowPreview'];
			if (params.includeTomorrow) {
				const tomorrow = new Date(targetDate);
				tomorrow.setDate(tomorrow.getDate() + 1);
				const tomorrowStart = new Date(tomorrow);
				tomorrowStart.setHours(0, 0, 0, 0);
				const tomorrowEnd = new Date(tomorrow);
				tomorrowEnd.setHours(23, 59, 59, 999);

				const tomorrowShifts = await db
					.select({
						userId: shifts.userId,
						userName: users.name
					})
					.from(shifts)
					.innerJoin(users, eq(shifts.userId, users.id))
					.where(and(
						lte(shifts.startTime, tomorrowEnd),
						gte(shifts.endTime, tomorrowStart)
					));

				const uniqueTomorrowStaff = [...new Set(tomorrowShifts.map(s => s.userName))];

				tomorrowPreview = {
					date: tomorrow.toISOString().split('T')[0],
					totalShifts: tomorrowShifts.length,
					staffNames: uniqueTomorrowStaff
				};
			}

			return {
				success: true,
				date: dateStr,
				totalShifts: shiftsForDay.length,
				totalStaffScheduled: uniqueStaff.size,
				locations: locationSchedules,
				tomorrowPreview
			};
		} catch (error) {
			console.error('[AI Tool] view_schedule error:', error);
			return {
				success: false,
				date: params.date || new Date().toISOString().split('T')[0],
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

		const dateDisplay = formatDate(result.date);
		let output = `Schedule for ${dateDisplay}:\n`;
		output += `Total: ${result.totalShifts} shift(s), ${result.totalStaffScheduled} staff member(s)\n\n`;

		if (result.locations.length === 0) {
			output += 'No shifts scheduled for this date.';
		} else {
			for (const location of result.locations) {
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
