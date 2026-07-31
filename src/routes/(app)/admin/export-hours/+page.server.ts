import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { paidHoursByEntry } from '$lib/server/utils/break-allowance';
import { parsePacificDate, parsePacificEndOfDay } from '$lib/server/utils/timezone';
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

	// Date range from query params, defaulting to the most recently completed
	// pay period (this page exists to export a pay period for payroll).
	let startParam = url.searchParams.get('start');
	let endParam = url.searchParams.get('end');

	if (!startParam || !endParam) {
		const period = lastCompletedPayPeriod(payPeriods);
		if (period) {
			startParam = period.startDate;
			endParam = period.endDate;
		} else {
			endParam = new Date().toISOString().split('T')[0];
			startParam = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		}
	}

	// Pacific-day boundaries: 00:00:00 on start day through 23:59:59 on end day
	const startDate = parsePacificDate(startParam);
	const endDate = parsePacificEndOfDay(endParam);

	// Get time entries with user info
	const entries = await db
		.select({
			id: timeEntries.id,
			userId: timeEntries.userId,
			userName: users.name,
			userEmail: users.email,
			hourlyRate: users.hourlyRate,
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
		.orderBy(desc(timeEntries.clockIn));

	// Paid hours per entry, with the break allowance applied (unpaid break time deducted)
	const paidHours = await paidHoursByEntry(entries);

	// Calculate hours and pay for each entry
	const entriesWithHours = entries.map(entry => {
		const hours = paidHours.get(entry.id) ?? 0;
		const rate = parseFloat(entry.hourlyRate || '0');
		const pay = hours * rate;
		return {
			...entry,
			hours: Math.round(hours * 100) / 100,
			pay: Math.round(pay * 100) / 100
		};
	});

	// Group by user for summary
	const userSummary = entriesWithHours.reduce((acc, entry) => {
		if (!acc[entry.userId]) {
			acc[entry.userId] = {
				name: entry.userName,
				email: entry.userEmail,
				hourlyRate: entry.hourlyRate,
				totalHours: 0,
				totalPay: 0,
				entries: 0
			};
		}
		acc[entry.userId].totalHours += entry.hours;
		acc[entry.userId].totalPay += entry.pay;
		acc[entry.userId].entries += 1;
		return acc;
	}, {} as Record<string, any>);

	return {
		entries: entriesWithHours,
		userSummary: Object.values(userSummary),
		startDate: startParam,
		endDate: endParam,
		periodLabel: `${formatShortDate(startParam)} - ${formatShortDate(endParam)}`,
		payPeriods
	};
};
