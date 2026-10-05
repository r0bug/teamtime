import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, timeEntries, users, appSettings, clockOutWarnings, breakEntries } from '$lib/server/db';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import {
	toPacificDateString,
	toPacificTimeString,
	parsePacificDate,
	parsePacificEndOfDay
} from '$lib/server/utils/timezone';
import {
	loadPayPeriodConfig,
	calculatePayPeriods,
	lastCompletedPayPeriod,
	formatShortDate
} from '$lib/server/utils/pay-periods';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const payPeriodConfig = await loadPayPeriodConfig();
	const payPeriods = calculatePayPeriods(payPeriodConfig, 8);

	// Get date range from query params or default to previous (most recently completed) pay period
	let startParam = url.searchParams.get('start');
	let endParam = url.searchParams.get('end');

	if (!startParam || !endParam) {
		const previousPeriod = lastCompletedPayPeriod(payPeriods);
		if (previousPeriod) {
			startParam = previousPeriod.startDate;
			endParam = previousPeriod.endDate;
		} else {
			endParam = new Date().toISOString().split('T')[0];
			startParam = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		}
	}

	// Pacific-day boundaries: 00:00:00 on start day through 23:59:59 on end day
	const startDate = parsePacificDate(startParam);
	const endDate = parsePacificEndOfDay(endParam);

	// Query time entries with user info
	const entries = await db
		.select({
			entryId: timeEntries.id,
			userId: users.id,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			notes: timeEntries.notes
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(
			gte(timeEntries.clockIn, startDate),
			lte(timeEntries.clockIn, endDate)
		))
		.orderBy(users.name, timeEntries.clockIn);

	// Get force clock-out warnings for entries in this range
	const entryIds = entries.map(e => e.entryId);
	const forceClockOuts = new Set<string>();

	if (entryIds.length > 0) {
		const warnings = await db
			.select({ timeEntryId: clockOutWarnings.timeEntryId })
			.from(clockOutWarnings)
			.where(eq(clockOutWarnings.warningType, 'force_clockout'));

		for (const w of warnings) {
			if (entryIds.includes(w.timeEntryId)) {
				forceClockOuts.add(w.timeEntryId);
			}
		}
	}

	// Query break entries for all time entries in range
	const breakMinutesByEntry = new Map<string, number>();
	if (entryIds.length > 0) {
		const breakData = await db
			.select({
				timeEntryId: breakEntries.timeEntryId,
				breakStart: breakEntries.breakStart,
				breakEnd: breakEntries.breakEnd
			})
			.from(breakEntries)
			.where(inArray(breakEntries.timeEntryId, entryIds));

		for (const b of breakData) {
			if (b.breakStart && b.breakEnd) {
				const minutes = (b.breakEnd.getTime() - b.breakStart.getTime()) / (1000 * 60);
				breakMinutesByEntry.set(
					b.timeEntryId,
					(breakMinutesByEntry.get(b.timeEntryId) || 0) + minutes
				);
			}
		}
	}

	// Load break allowance config
	const [breakAllowanceSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'break_allowance_config'))
		.limit(1);

	let breakAllowanceConfig = { minutesPer: 15, perHours: 4 };
	if (breakAllowanceSetting) {
		try { breakAllowanceConfig = JSON.parse(breakAllowanceSetting.value); } catch { /* use default */ }
	}

	// Group by employee, then by date (Pacific timezone)
	const employeeMap = new Map<string, {
		userId: string;
		name: string;
		daysMap: Map<string, {
			date: string;
			dayLabel: string;
			entries: Array<{
				id: string;
				clockIn: string;
				clockOut: string | null;
				clockInFormatted: string;
				clockOutFormatted: string;
				hours: number;
				breakMinutes: number;
				allowedBreakMinutes: number;
				excessBreakMinutes: number;
				wasForceClockOut: boolean;
				notes: string | null;
			}>;
		}>;
		totalHours: number;
	}>();

	for (const entry of entries) {
		if (!employeeMap.has(entry.userId)) {
			employeeMap.set(entry.userId, {
				userId: entry.userId,
				name: entry.userName,
				daysMap: new Map(),
				totalHours: 0
			});
		}

		const emp = employeeMap.get(entry.userId)!;
		const pacificDate = entry.clockIn ? toPacificDateString(entry.clockIn) : 'unknown';

		if (!emp.daysMap.has(pacificDate)) {
			const dateObj = new Date(pacificDate + 'T12:00:00');
			emp.daysMap.set(pacificDate, {
				date: pacificDate,
				dayLabel: dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
				entries: []
			});
		}

		const day = emp.daysMap.get(pacificDate)!;
		let rawHours = 0;
		if (entry.clockIn && entry.clockOut) {
			rawHours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
		}

		// Break allowance calculation
		const breakMinutes = Math.round((breakMinutesByEntry.get(entry.entryId) || 0) * 100) / 100;
		const allowedBreakMinutes = Math.round(rawHours * (breakAllowanceConfig.minutesPer / breakAllowanceConfig.perHours) * 100) / 100;
		const excessBreakMinutes = Math.max(0, Math.round((breakMinutes - allowedBreakMinutes) * 100) / 100);

		// Deduct only excess break time from hours
		let hours = rawHours - (excessBreakMinutes / 60);
		hours = Math.max(0, Math.round(hours * 100) / 100);

		emp.totalHours += hours;

		day.entries.push({
			id: entry.entryId,
			clockIn: entry.clockIn?.toISOString() || '',
			clockOut: entry.clockOut?.toISOString() || null,
			clockInFormatted: entry.clockIn ? toPacificTimeString(entry.clockIn) : '-',
			clockOutFormatted: entry.clockOut ? toPacificTimeString(entry.clockOut) : 'Active',
			hours,
			breakMinutes,
			allowedBreakMinutes,
			excessBreakMinutes,
			wasForceClockOut: forceClockOuts.has(entry.entryId),
			notes: entry.notes
		});
	}

	// Convert to sorted arrays
	const employees = Array.from(employeeMap.values())
		.map(emp => {
			const days = Array.from(emp.daysMap.values())
				.sort((a, b) => a.date.localeCompare(b.date))
				.map(day => ({
					...day,
					dailyHours: Math.round(day.entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100
				}));

			return {
				userId: emp.userId,
				name: emp.name,
				days,
				totalHours: Math.round(emp.totalHours * 100) / 100
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const periodLabel = `${formatShortDate(startParam)} - ${formatShortDate(endParam)}`;

	return {
		employees,
		startDate: startParam,
		endDate: endParam,
		periodLabel,
		payPeriods,
		grandTotals: {
			totalHours: Math.round(employees.reduce((sum, e) => sum + e.totalHours, 0) * 100) / 100,
			employeeCount: employees.length
		}
	};
};
