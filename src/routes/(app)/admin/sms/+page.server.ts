import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isAdmin, isManager } from '$lib/server/auth/roles';
import { isTwilioConfigured } from '$lib/server/twilio';
import { db, jobs, users, smsLogs, officeManagerChats, officeManagerPendingActions } from '$lib/server/db';
import { eq, desc, sql, and, gte, inArray } from 'drizzle-orm';
import type { OfficeManagerMessage } from '$lib/server/db/schema';

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

	// --- SMS Office-Manager Conversations ---
	// Admins see all channel='sms' chats; managers see only their own.
	const userIsAdmin = isAdmin(locals.user);
	const conversationFilter = userIsAdmin
		? eq(officeManagerChats.channel, 'sms')
		: and(eq(officeManagerChats.channel, 'sms'), eq(officeManagerChats.userId, locals.user!.id));

	const smsChats = await db
		.select({
			id: officeManagerChats.id,
			userId: officeManagerChats.userId,
			title: officeManagerChats.title,
			messages: officeManagerChats.messages,
			createdAt: officeManagerChats.createdAt,
			updatedAt: officeManagerChats.updatedAt
		})
		.from(officeManagerChats)
		.where(conversationFilter)
		.orderBy(desc(officeManagerChats.updatedAt))
		.limit(25);

	// Pending actions for those chats (to show "awaiting PIN" indicators)
	const chatIds = smsChats.map((c) => c.id);
	const pendingByChat = new Map<string, number>();
	if (chatIds.length > 0) {
		const pending = await db
			.select({
				chatId: officeManagerPendingActions.chatId,
				count: sql<number>`count(*)::int`
			})
			.from(officeManagerPendingActions)
			.where(
				and(
					inArray(officeManagerPendingActions.chatId, chatIds),
					eq(officeManagerPendingActions.status, 'pending'),
					eq(officeManagerPendingActions.requiresPin, true),
					gte(officeManagerPendingActions.expiresAt, new Date())
				)
			)
			.groupBy(officeManagerPendingActions.chatId);
		for (const row of pending) {
			pendingByChat.set(row.chatId, Number(row.count));
		}
	}

	// Enrich with user name
	const chatUserIds = [...new Set(smsChats.map((c) => c.userId))];
	const chatUserNames = new Map<string, string>();
	if (chatUserIds.length > 0) {
		const rows = await db
			.select({ id: users.id, name: users.name, role: users.role, smsLockedUntil: users.smsLockedUntil })
			.from(users)
			.where(inArray(users.id, chatUserIds));
		for (const r of rows) {
			chatUserNames.set(r.id, r.name);
		}
	}

	const conversations = smsChats.map((c) => {
		const msgs = (c.messages || []) as OfficeManagerMessage[];
		const lastMsg = msgs[msgs.length - 1];
		return {
			id: c.id,
			userId: c.userId,
			userName: chatUserNames.get(c.userId) || 'Unknown',
			title: c.title,
			messageCount: msgs.length,
			lastMessageAt: c.updatedAt,
			lastMessagePreview: lastMsg ? lastMsg.content.slice(0, 160) : '',
			lastMessageRole: lastMsg?.role ?? null,
			pendingPinActions: pendingByChat.get(c.id) ?? 0,
			messages: msgs.slice(-30) // last 30 messages for the drawer
		};
	});

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
		optOutCount: Number(optOutCount[0]?.count || 0),
		conversations,
		viewerIsAdmin: userIsAdmin
	};
};
