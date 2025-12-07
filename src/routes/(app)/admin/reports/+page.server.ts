import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, timeEntries, atmWithdrawals, withdrawalAllocations } from '$lib/server/db';
import { sql, gte, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	// Time stats
	const timeStats = await db
		.select({
			totalHours: sql<number>`
				SUM(
					CASE
						WHEN ${timeEntries.clockOut} IS NOT NULL
						THEN EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600
						ELSE 0
					END
				)
			`,
			totalEntries: sql<number>`COUNT(*)::int`,
			activeEmployees: sql<number>`COUNT(DISTINCT ${timeEntries.userId})::int`
		})
		.from(timeEntries)
		.where(gte(timeEntries.clockIn, last30Days));

	const avgHoursPerDay = (timeStats[0]?.totalHours || 0) / 30;

	// Expense stats
	const expenseStats = await db
		.select({
			totalWithdrawn: sql<number>`COALESCE(SUM(${atmWithdrawals.amount}), 0)::numeric`,
			withdrawalCount: sql<number>`COUNT(*)::int`
		})
		.from(atmWithdrawals)
		.where(gte(atmWithdrawals.withdrawnAt, last30Days));

	const allocatedStats = await db
		.select({
			totalAllocated: sql<number>`COALESCE(SUM(${withdrawalAllocations.amount}), 0)::numeric`
		})
		.from(withdrawalAllocations)
		.where(gte(withdrawalAllocations.createdAt, last30Days));

	const totalWithdrawn = Number(expenseStats[0]?.totalWithdrawn) || 0;
	const totalAllocated = Number(allocatedStats[0]?.totalAllocated) || 0;

	return {
		timeStats: {
			totalHours: timeStats[0]?.totalHours || 0,
			totalEntries: timeStats[0]?.totalEntries || 0,
			activeEmployees: timeStats[0]?.activeEmployees || 0,
			avgHoursPerDay
		},
		expenseStats: {
			totalWithdrawn,
			totalAllocated,
			unallocated: totalWithdrawn - totalAllocated,
			withdrawalCount: expenseStats[0]?.withdrawalCount || 0
		}
	};
};
