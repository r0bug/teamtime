import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { isTwilioConfigured } from '$lib/server/twilio';
import { db, jobs, users, smsLogs } from '$lib/server/db';
import { eq, desc, sql, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const configured = isTwilioConfigured();

	// Recent SMS jobs (scheduled)
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

	// Job stats
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

	// Staff phone coverage
	const staffList = await db
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			isActive: users.isActive
		})
		.from(users)
		.where(eq(users.isActive, true));

	const withPhone = staffList.filter(u => u.phone);
	const withoutPhone = staffList.filter(u => !u.phone);

	// SMS delivery log (outbound with delivery status)
	const deliveryLog = await db
		.select({
			id: smsLogs.id,
			messageSid: smsLogs.messageSid,
			status: smsLogs.status,
			toNumber: smsLogs.toNumber,
			body: smsLogs.body,
			userId: smsLogs.userId,
			errorCode: smsLogs.errorCode,
			errorMessage: smsLogs.errorMessage,
			createdAt: smsLogs.createdAt,
			statusUpdatedAt: smsLogs.statusUpdatedAt
		})
		.from(smsLogs)
		.where(eq(smsLogs.direction, 'outbound'))
		.orderBy(desc(smsLogs.createdAt))
		.limit(50);

	// Enrich delivery log with user names
	const userIds = [...new Set(deliveryLog.filter(l => l.userId).map(l => l.userId!))];
	const userMap: Record<string, string> = {};
	if (userIds.length > 0) {
		const userRows = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(sql`${users.id} IN ${userIds}`);
		for (const u of userRows) {
			userMap[u.id] = u.name;
		}
	}

	const enrichedDeliveryLog = deliveryLog.map(l => ({
		...l,
		userName: l.userId ? (userMap[l.userId] || null) : null
	}));

	// Delivery stats
	const deliveryStats = await db
		.select({
			status: smsLogs.status,
			count: sql<number>`count(*)`
		})
		.from(smsLogs)
		.where(eq(smsLogs.direction, 'outbound'))
		.groupBy(smsLogs.status);

	const dStats: Record<string, number> = {};
	for (const row of deliveryStats) {
		dStats[row.status] = Number(row.count);
	}

	// Inbound replies
	const inboundMessages = await db
		.select({
			id: smsLogs.id,
			status: smsLogs.status,
			fromNumber: smsLogs.fromNumber,
			body: smsLogs.body,
			userId: smsLogs.userId,
			createdAt: smsLogs.createdAt
		})
		.from(smsLogs)
		.where(eq(smsLogs.direction, 'inbound'))
		.orderBy(desc(smsLogs.createdAt))
		.limit(50);

	// Enrich inbound with user names
	const inboundUserIds = [...new Set(inboundMessages.filter(m => m.userId).map(m => m.userId!))];
	if (inboundUserIds.length > 0) {
		const inboundUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(sql`${users.id} IN ${inboundUserIds}`);
		for (const u of inboundUsers) {
			if (!userMap[u.id]) userMap[u.id] = u.name;
		}
	}

	const enrichedInbound = inboundMessages.map(m => ({
		...m,
		userName: m.userId ? (userMap[m.userId] || null) : null
	}));

	// Opt-out count
	const optOutCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(smsLogs)
		.where(and(eq(smsLogs.direction, 'inbound'), eq(smsLogs.status, 'opt_out')));

	return {
		configured,
		stats,
		recentJobs,
		staffCoverage: {
			total: staffList.length,
			withPhone: withPhone.length,
			withoutPhone: withoutPhone.length,
			missingPhones: withoutPhone.map(u => ({ id: u.id, name: u.name }))
		},
		deliveryLog: enrichedDeliveryLog,
		deliveryStats: dStats,
		inboundMessages: enrichedInbound,
		optOutCount: Number(optOutCount[0]?.count || 0)
	};
};
