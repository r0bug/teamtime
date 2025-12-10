// Get Available Staff Tool - Read-only query for staff availability
import { db, users, shifts, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, isNull, or } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';

interface GetAvailableStaffParams {
	date: string; // ISO date string (YYYY-MM-DD)
	locationId?: string;
	roleFilter?: 'staff' | 'manager' | 'admin' | 'purchaser';
}

interface StaffAvailability {
	userId: string;
	name: string;
	role: string;
	phone: string | null;
	scheduledShifts: {
		id: string;
		startTime: string;
		endTime: string;
		locationId: string | null;
	}[];
	isClockedIn: boolean;
	clockedInAt: string | null;
}

interface GetAvailableStaffResult {
	success: boolean;
	date: string;
	staff: StaffAvailability[];
	error?: string;
}

export const getAvailableStaffTool: AITool<GetAvailableStaffParams, GetAvailableStaffResult> = {
	name: 'get_available_staff',
	description: 'Query staff availability for a specific date. Returns who is scheduled to work, who is currently clocked in, and their contact information. Use this to understand staffing before making schedule decisions.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'The date to check availability for (YYYY-MM-DD format)'
			},
			locationId: {
				type: 'string',
				description: 'Optional location ID to filter by'
			},
			roleFilter: {
				type: 'string',
				enum: ['staff', 'manager', 'admin', 'purchaser'],
				description: 'Optional role to filter by'
			}
		},
		required: ['date']
	},

	requiresApproval: false,
	requiresConfirmation: false, // Read-only, no confirmation needed

	// No cooldown for read-only queries

	validate(params: GetAvailableStaffParams) {
		if (!params.date) {
			return { valid: false, error: 'Date is required' };
		}
		// Validate date format
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(params.date)) {
			return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
		}
		return { valid: true };
	},

	async execute(params: GetAvailableStaffParams, context: ToolExecutionContext): Promise<GetAvailableStaffResult> {
		try {
			const targetDate = new Date(params.date);
			const dayStart = new Date(targetDate);
			dayStart.setHours(0, 0, 0, 0);
			const dayEnd = new Date(targetDate);
			dayEnd.setHours(23, 59, 59, 999);

			// Get all active users, optionally filtered by role
			let usersQuery = db
				.select({
					id: users.id,
					name: users.name,
					role: users.role,
					phone: users.phone
				})
				.from(users)
				.where(eq(users.isActive, true));

			const allUsers = await usersQuery;

			// Filter by role if specified
			const filteredUsers = params.roleFilter
				? allUsers.filter(u => u.role === params.roleFilter)
				: allUsers;

			// Get shifts for the date range
			const shiftsForDay = await db
				.select({
					id: shifts.id,
					userId: shifts.userId,
					locationId: shifts.locationId,
					startTime: shifts.startTime,
					endTime: shifts.endTime
				})
				.from(shifts)
				.where(
					and(
						lte(shifts.startTime, dayEnd),
						gte(shifts.endTime, dayStart)
					)
				);

			// Filter by location if specified
			const filteredShifts = params.locationId
				? shiftsForDay.filter(s => s.locationId === params.locationId)
				: shiftsForDay;

			// Get current time entries (who is clocked in)
			const openTimeEntries = await db
				.select({
					userId: timeEntries.userId,
					clockIn: timeEntries.clockIn
				})
				.from(timeEntries)
				.where(isNull(timeEntries.clockOut));

			// Build staff availability data
			const staff: StaffAvailability[] = filteredUsers.map(user => {
				const userShifts = filteredShifts
					.filter(s => s.userId === user.id)
					.map(s => ({
						id: s.id,
						startTime: s.startTime.toISOString(),
						endTime: s.endTime.toISOString(),
						locationId: s.locationId
					}));

				const clockedInEntry = openTimeEntries.find(te => te.userId === user.id);

				return {
					userId: user.id,
					name: user.name,
					role: user.role,
					phone: user.phone,
					scheduledShifts: userShifts,
					isClockedIn: !!clockedInEntry,
					clockedInAt: clockedInEntry ? clockedInEntry.clockIn.toISOString() : null
				};
			});

			// Sort: clocked in first, then by scheduled shifts, then by name
			staff.sort((a, b) => {
				if (a.isClockedIn && !b.isClockedIn) return -1;
				if (!a.isClockedIn && b.isClockedIn) return 1;
				if (a.scheduledShifts.length > 0 && b.scheduledShifts.length === 0) return -1;
				if (a.scheduledShifts.length === 0 && b.scheduledShifts.length > 0) return 1;
				return a.name.localeCompare(b.name);
			});

			return {
				success: true,
				date: params.date,
				staff
			};
		} catch (error) {
			console.error('[AI Tool] get_available_staff error:', error);
			return {
				success: false,
				date: params.date,
				staff: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetAvailableStaffResult): string {
		if (!result.success) {
			return `Failed to get staff availability: ${result.error}`;
		}

		const clockedIn = result.staff.filter(s => s.isClockedIn);
		const scheduled = result.staff.filter(s => s.scheduledShifts.length > 0 && !s.isClockedIn);
		const available = result.staff.filter(s => s.scheduledShifts.length === 0 && !s.isClockedIn);

		let output = `Staff availability for ${result.date}:\n`;
		output += `- Clocked in: ${clockedIn.length} (${clockedIn.map(s => s.name).join(', ') || 'none'})\n`;
		output += `- Scheduled: ${scheduled.length} (${scheduled.map(s => s.name).join(', ') || 'none'})\n`;
		output += `- Available: ${available.length}`;

		return output;
	}
};
