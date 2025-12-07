import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, timeEntries } from '$lib/server/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get date range from query params or default to current week
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');

	const now = new Date();
	const startOfWeek = startParam ? new Date(startParam) : new Date(now);
	if (!startParam) {
		startOfWeek.setDate(now.getDate() - now.getDay());
		startOfWeek.setHours(0, 0, 0, 0);
	}

	const endOfWeek = endParam ? new Date(endParam) : new Date(startOfWeek);
	if (!endParam) {
		endOfWeek.setDate(startOfWeek.getDate() + 7);
	}

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
			gte(timeEntries.clockIn, startOfWeek),
			lte(timeEntries.clockIn, endOfWeek)
		))
		.orderBy(desc(timeEntries.clockIn));

	// Calculate hours and pay for each entry
	const entriesWithHours = entries.map(entry => {
		let hours = 0;
		if (entry.clockIn && entry.clockOut) {
			hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
		}
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
		startDate: startOfWeek.toISOString().split('T')[0],
		endDate: endOfWeek.toISOString().split('T')[0]
	};
};
