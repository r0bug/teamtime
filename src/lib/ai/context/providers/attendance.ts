// Attendance Context Provider - Clock in/out status and scheduled vs actual
import { db, users, shifts, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';

interface AttendanceData {
	currentlyClockedIn: {
		userId: string;
		userName: string;
		clockedInAt: Date;
		minutesClockedIn: number;
		hasScheduledShift: boolean;
		shiftEndTime?: Date;
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
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(now);
		todayEnd.setHours(23, 59, 59, 999);

		// Get all active users
		const activeUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.isActive, true));

		const userMap = new Map(activeUsers.map(u => [u.id, u.name]));

		// Get today's shifts
		const todayShifts = await db
			.select()
			.from(shifts)
			.where(and(
				gte(shifts.startTime, todayStart),
				lte(shifts.startTime, todayEnd)
			));

		// Get today's time entries (including those still clocked in)
		const todayTimeEntries = await db
			.select()
			.from(timeEntries)
			.where(gte(timeEntries.clockIn, todayStart));

		// Currently clocked in (no clock out)
		const currentlyClockedIn = todayTimeEntries
			.filter(te => !te.clockOut)
			.map(te => {
				const minutesClockedIn = Math.round((now.getTime() - new Date(te.clockIn).getTime()) / 60000);
				const userShift = todayShifts.find(s => s.userId === te.userId);
				return {
					userId: te.userId,
					userName: userMap.get(te.userId) || 'Unknown',
					clockedInAt: new Date(te.clockIn),
					minutesClockedIn,
					hasScheduledShift: !!userShift,
					shiftEndTime: userShift ? new Date(userShift.endTime) : undefined
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
		const recentClockOuts = todayTimeEntries
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
				let status = `${c.minutesClockedIn} min`;
				if (c.hasScheduledShift && c.shiftEndTime) {
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
				lines.push(`- ${m.userName}: ${m.minutesLate} min late (shift: ${m.shiftStartTime.toLocaleTimeString()} - ${m.shiftEndTime.toLocaleTimeString()})`);
			}
			lines.push('');
		}

		if (context.recentClockOuts.length > 0) {
			lines.push('### Recent Clock Outs (last 2 hrs):');
			for (const c of context.recentClockOuts) {
				lines.push(`- ${c.userName} at ${c.clockedOutAt.toLocaleTimeString()}`);
			}
		}

		return lines.join('\n');
	}
};
