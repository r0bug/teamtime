import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isTwilioConfigured } from '$lib/server/twilio';
import { db, jobs, users } from '$lib/server/db';
import { eq, and, desc, sql } from 'drizzle-orm';

// GET /api/sms/status - Get SMS system status (admin/manager only)
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !['manager', 'admin'].includes(locals.user.role)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const configured = isTwilioConfigured();

	// Get recent SMS jobs
	const recentJobs = await db
		.select({
			id: jobs.id,
			status: jobs.status,
			payload: jobs.payload,
			result: jobs.result,
			error: jobs.error,
			createdAt: jobs.createdAt,
			completedAt: jobs.completedAt,
			runAt: jobs.runAt,
			attempts: jobs.attempts
		})
		.from(jobs)
		.where(eq(jobs.type, 'scheduled_sms'))
		.orderBy(desc(jobs.createdAt))
		.limit(20);

	// Get SMS job stats
	const jobStats = await db
		.select({
			status: jobs.status,
			count: sql<number>`count(*)`
		})
		.from(jobs)
		.where(eq(jobs.type, 'scheduled_sms'))
		.groupBy(jobs.status);

	const stats: Record<string, number> = {};
	for (const row of jobStats) {
		stats[row.status] = Number(row.count);
	}

	// Get staff with phone numbers
	const staffPhones = await db
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			isActive: users.isActive
		})
		.from(users)
		.where(eq(users.isActive, true));

	const withPhone = staffPhones.filter(u => u.phone);
	const withoutPhone = staffPhones.filter(u => !u.phone);

	return json({
		configured,
		jobStats: stats,
		recentJobs,
		staffCoverage: {
			total: staffPhones.length,
			withPhone: withPhone.length,
			withoutPhone: withoutPhone.length,
			missingPhones: withoutPhone.map(u => ({ id: u.id, name: u.name }))
		}
	});
};
