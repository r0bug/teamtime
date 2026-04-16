import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, timeEntries, users, appSettings, clockOutWarnings, breakEntries } from '$lib/server/db';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { toPacificDateString, toPacificTimeString } from '$lib/server/utils/timezone';

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
	payday: Date;
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

function calculatePayPeriods(config: PayPeriodConfig, count: number): PayPeriod[] {
	const periods: PayPeriod[] = [];
	const now = new Date();
	const currentMonth = now.getMonth();
	const currentYear = now.getFullYear();

	if (config.type === 'semi-monthly') {
		for (let monthOffset = -3; monthOffset <= 1; monthOffset++) {
			const targetMonth = currentMonth + monthOffset;
			const targetYear = currentYear + Math.floor(targetMonth / 12);
			const adjustedMonth = ((targetMonth % 12) + 12) % 12;

			// Period 1: crosses month boundary (e.g., 26th to 10th)
			if (config.period1Start > config.period1End) {
				const startDate = new Date(targetYear, adjustedMonth - 1, config.period1Start);
				const endDate = new Date(targetYear, adjustedMonth, config.period1End, 23, 59, 59);
				const payday = new Date(targetYear, adjustedMonth, config.period1Payday);
				const isCurrent = now >= startDate && now <= endDate;

				periods.push({
					startDate,
					endDate,
					payday,
					label: `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`,
					isCurrent
				});
			}

			// Period 2: within same month (e.g., 11th to 25th)
			const p2StartDate = new Date(targetYear, adjustedMonth, config.period2Start);
			const p2EndDate = new Date(targetYear, adjustedMonth, config.period2End, 23, 59, 59);
			const p2Payday = new Date(targetYear, adjustedMonth, config.period2Payday);
			const p2IsCurrent = now >= p2StartDate && now <= p2EndDate;

			periods.push({
				startDate: p2StartDate,
				endDate: p2EndDate,
				payday: p2Payday,
				label: `${formatShortDate(p2StartDate)} - ${formatShortDate(p2EndDate)}`,
				isCurrent: p2IsCurrent
			});
		}
	}

	periods.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
	return periods.slice(0, count);
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

	const payPeriods = calculatePayPeriods(payPeriodConfig, 8);

	// Get date range from query params or default to previous (most recently completed) pay period
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');

	let startDate: Date;
	let endDate: Date;

	if (startParam && endParam) {
		startDate = new Date(startParam + 'T00:00:00');
		endDate = new Date(endParam + 'T23:59:59');
	} else {
		// Find the most recently completed pay period (first non-current past period)
		const now = new Date();
		const pastPeriods = payPeriods.filter(p => p.endDate < now && !p.isCurrent);
		const previousPeriod = pastPeriods[0] || payPeriods[1] || payPeriods[0];
		if (previousPeriod) {
			startDate = previousPeriod.startDate;
			endDate = previousPeriod.endDate;
		} else {
			endDate = new Date();
			startDate = new Date(endDate.getTime() - 15 * 24 * 60 * 60 * 1000);
		}
	}

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

	const periodLabel = `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;

	return {
		employees,
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		periodLabel,
		payPeriods: payPeriods.map(p => ({
			startDate: p.startDate.toISOString().split('T')[0],
			endDate: p.endDate.toISOString().split('T')[0],
			label: p.label,
			isCurrent: p.isCurrent
		})),
		grandTotals: {
			totalHours: Math.round(employees.reduce((sum, e) => sum + e.totalHours, 0) * 100) / 100,
			employeeCount: employees.length
		}
	};
};
