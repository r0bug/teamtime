// Attendance Context Provider - Clock in/out status and scheduled vs actual
import { db, users, shifts, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, isNull, isNotNull, inArray } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import { getCurrentUserId } from './user-permissions';
import { visibilityService } from '$lib/server/services/visibility-service';
import { getPacificDayBounds, toPacificTimeString } from '$lib/server/utils/timezone';

interface AttendanceData {
	currentlyClockedIn: {
		userId: string;
		userName: string;
		clockedInAt: Date;
		minutesClockedIn: number;
		hasScheduledShift: boolean;
		shiftEndTime?: Date;
		likelyForgotToClockOut?: boolean;
	}[];
	expectedButMissing: {
		userId: string;
		userName: string;
		shiftStartTime: Date;
		shiftEndTime: Date;
		minutesLate: number;
	}[];
	recentClockOuts: {
		userId: string;
		userName: string;
		clockedOutAt: Date;
		shiftWasScheduled: boolean;
	}[];
	summary: {
		totalClockedIn: number;
		totalExpectedNow: number;
		totalLateArrivals: number;
		totalOvertime: number;
	};
}

export const attendanceProvider: AIContextProvider<AttendanceData> = {
	moduleId: 'attendance',
	moduleName: 'Attendance & Time Tracking',
	description: 'Current clock in/out status, late arrivals, and overtime alerts',
	priority: 10, // High priority - core operational data
	agents: ['office_manager'],

	async isEnabled() {
		return true; // Always enabled
	},

	async getContext(): Promise<AttendanceData> {
		const now = new Date();
		// Use Pacific timezone for "today" boundaries
		const { start: todayStart, end: todayEnd } = getPacificDayBounds(now);

		// Get visibility filter for attendance
		const currentUserId = getCurrentUserId();
		let visibleUserIds: string[] | null = null;

		if (currentUserId) {
			const filter = await visibilityService.getVisibilityFilter(currentUserId, 'attendance');
			if (!filter.includeAll) {
				visibleUserIds = await visibilityService.getVisibleUserIds(currentUserId, 'attendance');
			}
		}

		// Get all active users (may be filtered later)
		const activeUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.isActive, true));

		const userMap = new Map(activeUsers.map(u => [u.id, u.name]));

		// Build conditions for shifts
		const shiftConditions = [
			gte(shifts.startTime, todayStart),
			lte(shifts.startTime, todayEnd)
		];

		// Add visibility filter if needed
		if (visibleUserIds !== null) {
			const userIds = visibleUserIds.length > 0 ? visibleUserIds : (currentUserId ? [currentUserId] : []);
			if (userIds.length > 0) {
				shiftConditions.push(inArray(shifts.userId, userIds));
			}
		}

		// Get today's shifts
		const todayShifts = await db
			.select()
			.from(shifts)
			.where(and(...shiftConditions));

		// Get ALL currently clocked in entries (no clock out, regardless of when they clocked in)
		// This catches people who forgot to clock out from previous days
		const currentlyOpenConditions = [isNull(timeEntries.clockOut)];
		if (visibleUserIds !== null) {
			const userIds = visibleUserIds.length > 0 ? visibleUserIds : (currentUserId ? [currentUserId] : []);
			if (userIds.length > 0) {
				currentlyOpenConditions.push(inArray(timeEntries.userId, userIds));
			}
		}
		const openTimeEntries = await db
			.select()
			.from(timeEntries)
			.where(and(...currentlyOpenConditions));

		// Get today's completed time entries (for recent clock outs)
		const todayCompletedConditions = [
			gte(timeEntries.clockIn, todayStart),
			isNotNull(timeEntries.clockOut)
		];
		if (visibleUserIds !== null) {
			const userIds = visibleUserIds.length > 0 ? visibleUserIds : (currentUserId ? [currentUserId] : []);
			if (userIds.length > 0) {
				todayCompletedConditions.push(inArray(timeEntries.userId, userIds));
			}
		}
		const todayCompletedEntries = await db
			.select()
			.from(timeEntries)
			.where(and(...todayCompletedConditions));

		// Currently clocked in (from open entries - includes people who forgot to clock out)
		const currentlyClockedIn = openTimeEntries
			.map(te => {
				const clockInDate = new Date(te.clockIn);
				const minutesClockedIn = Math.round((now.getTime() - clockInDate.getTime()) / 60000);
				const userShift = todayShifts.find(s => s.userId === te.userId);
				// Flag if clocked in for more than 16 hours (likely forgot to clock out)
				const likelyForgotToClockOut = minutesClockedIn > 16 * 60;
				return {
					userId: te.userId,
					userName: userMap.get(te.userId) || 'Unknown',
					clockedInAt: clockInDate,
					minutesClockedIn,
					hasScheduledShift: !!userShift,
					shiftEndTime: userShift ? new Date(userShift.endTime) : undefined,
					likelyForgotToClockOut
				};
			});

		// Expected now but not clocked in
		const clockedInUserIds = new Set(currentlyClockedIn.map(c => c.userId));
		const expectedButMissing = todayShifts
			.filter(s => {
				const shiftStart = new Date(s.startTime);
				const shiftEnd = new Date(s.endTime);
				// Shift has started but not ended, and user not clocked in
				return shiftStart <= now && shiftEnd > now && !clockedInUserIds.has(s.userId);
			})
			.map(s => ({
				userId: s.userId,
				userName: userMap.get(s.userId) || 'Unknown',
				shiftStartTime: new Date(s.startTime),
				shiftEndTime: new Date(s.endTime),
				minutesLate: Math.round((now.getTime() - new Date(s.startTime).getTime()) / 60000)
			}));

		// Recent clock outs (last 2 hours)
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		const recentClockOuts = todayCompletedEntries
			.filter(te => te.clockOut && new Date(te.clockOut) >= twoHoursAgo)
			.map(te => ({
				userId: te.userId,
				userName: userMap.get(te.userId) || 'Unknown',
				clockedOutAt: new Date(te.clockOut!),
				shiftWasScheduled: todayShifts.some(s => s.userId === te.userId)
			}));

		// Calculate summary
		const expectedNowCount = todayShifts.filter(s => {
			const start = new Date(s.startTime);
			const end = new Date(s.endTime);
			return start <= now && end > now;
		}).length;

		return {
			currentlyClockedIn,
			expectedButMissing,
			recentClockOuts,
			summary: {
				totalClockedIn: currentlyClockedIn.length,
				totalExpectedNow: expectedNowCount,
				totalLateArrivals: expectedButMissing.length,
				totalOvertime: currentlyClockedIn.filter(c => c.hasScheduledShift && c.shiftEndTime && now > c.shiftEndTime).length
			}
		};
	},

	estimateTokens(context: AttendanceData): number {
		// Rough estimate: ~50 tokens per clocked in user, ~30 per missing, ~20 per clock out
		return 100 +
			context.currentlyClockedIn.length * 50 +
			context.expectedButMissing.length * 30 +
			context.recentClockOuts.length * 20;
	},

	formatForPrompt(context: AttendanceData): string {
		const lines: string[] = [
			'## Attendance Status',
			`Summary: ${context.summary.totalClockedIn} clocked in, ${context.summary.totalExpectedNow} expected, ${context.summary.totalLateArrivals} late`,
			''
		];

		if (context.currentlyClockedIn.length > 0) {
			lines.push('### Currently Clocked In:');
			for (const c of context.currentlyClockedIn) {
				let status = '';
				// Format duration nicely
				if (c.minutesClockedIn >= 60 * 24) {
					const days = Math.floor(c.minutesClockedIn / (60 * 24));
					status = `${days} day(s)`;
				} else if (c.minutesClockedIn >= 60) {
					const hours = Math.floor(c.minutesClockedIn / 60);
					const mins = c.minutesClockedIn % 60;
					status = `${hours}h ${mins}m`;
				} else {
					status = `${c.minutesClockedIn} min`;
				}

				if (c.likelyForgotToClockOut) {
					status += ' ⚠️ LIKELY FORGOT TO CLOCK OUT - clocked in since ' + toPacificTimeString(c.clockedInAt);
				} else if (c.hasScheduledShift && c.shiftEndTime) {
					const minutesPastEnd = Math.round((new Date().getTime() - c.shiftEndTime.getTime()) / 60000);
					if (minutesPastEnd > 0) {
						status += ` (${minutesPastEnd} min past scheduled end)`;
					}
				} else if (!c.hasScheduledShift) {
					status += ' (unscheduled)';
				}
				lines.push(`- ${c.userName}: ${status}`);
			}
			lines.push('');
		}

		if (context.expectedButMissing.length > 0) {
			lines.push('### Expected But Not Clocked In:');
			for (const m of context.expectedButMissing) {
				lines.push(`- ${m.userName}: ${m.minutesLate} min late (shift: ${toPacificTimeString(m.shiftStartTime)} - ${toPacificTimeString(m.shiftEndTime)})`);
			}
			lines.push('');
		}

		if (context.recentClockOuts.length > 0) {
			lines.push('### Recent Clock Outs (last 2 hrs):');
			for (const c of context.recentClockOuts) {
				lines.push(`- ${c.userName} at ${toPacificTimeString(c.clockedOutAt)}`);
			}
		}

		return lines.join('\n');
	}
};
