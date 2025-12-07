import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, messages, conversations, timeEntries, shifts } from '$lib/server/db';
import { desc, eq, sql, and, gte, lte } from 'drizzle-orm';
import { isManager, isAdmin } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const now = new Date();
	const startOfWeek = new Date(now);
	startOfWeek.setDate(now.getDate() - now.getDay());
	startOfWeek.setHours(0, 0, 0, 0);

	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 7);

	// Get user stats
	const userStats = await db
		.select({
			total: sql<number>`count(*)`,
			active: sql<number>`count(*) filter (where is_active = true)`
		})
		.from(users);

	// Get recent messages count
	const messageStats = await db
		.select({ count: sql<number>`count(*)` })
		.from(messages)
		.where(gte(messages.createdAt, startOfWeek));

	// Get this week's hours
	const hoursStats = await db
		.select({
			totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60), 0)`
		})
		.from(timeEntries)
		.where(and(
			gte(timeEntries.clockIn, startOfWeek),
			lte(timeEntries.clockIn, endOfWeek)
		));

	// Get scheduled shifts this week
	const shiftStats = await db
		.select({ count: sql<number>`count(*)` })
		.from(shifts)
		.where(and(
			gte(shifts.startTime, startOfWeek),
			lte(shifts.startTime, endOfWeek)
		));

	// Get all users for quick overview
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			isActive: users.isActive,
			hourlyRate: users.hourlyRate,
			twoFactorEnabled: users.twoFactorEnabled
		})
		.from(users)
		.orderBy(users.name);

	return {
		isAdmin: isAdmin(locals.user),
		stats: {
			totalUsers: userStats[0]?.total || 0,
			activeUsers: userStats[0]?.active || 0,
			messagesThisWeek: messageStats[0]?.count || 0,
			hoursThisWeek: Math.round((hoursStats[0]?.totalMinutes || 0) / 60 * 10) / 10,
			shiftsThisWeek: shiftStats[0]?.count || 0
		},
		users: allUsers
	};
};
