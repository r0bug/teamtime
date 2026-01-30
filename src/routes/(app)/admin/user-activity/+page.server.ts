import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, auditLogs, timeEntries, taskCompletions, tasks, pricingDecisions, messages, pointTransactions, locations, shifts } from '$lib/server/db';
import { eq, desc, sql, and } from 'drizzle-orm';
import { canViewAuditLogs } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canViewAuditLogs(locals.user)) {
		throw redirect(302, '/admin');
	}

	const selectedUserId = url.searchParams.get('userId');
	const activityType = url.searchParams.get('type') || 'all';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = 50;
	const offset = (page - 1) * limit;

	// Get all active users for the dropdown
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	if (!selectedUserId) {
		return {
			users: allUsers,
			selectedUser: null,
			activities: [],
			activityType,
			page,
			totalPages: 0,
			totalCount: 0
		};
	}

	// Get selected user info
	const selectedUser = allUsers.find(u => u.id === selectedUserId);
	if (!selectedUser) {
		return {
			users: allUsers,
			selectedUser: null,
			activities: [],
			activityType,
			page,
			totalPages: 0,
			totalCount: 0
		};
	}

	// Fetch activities based on type
	type Activity = {
		id: string;
		type: string;
		action: string;
		description: string;
		details: Record<string, unknown> | null;
		createdAt: Date;
	};

	let activities: Activity[] = [];
	let totalCount = 0;

	if (activityType === 'all' || activityType === 'time') {
		// Time entries
		const timeData = await db
			.select({
				id: timeEntries.id,
				clockIn: timeEntries.clockIn,
				clockOut: timeEntries.clockOut,
				locationName: locations.name,
				createdAt: timeEntries.clockIn
			})
			.from(timeEntries)
			.leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
			.leftJoin(locations, eq(shifts.locationId, locations.id))
			.where(eq(timeEntries.userId, selectedUserId))
			.orderBy(desc(timeEntries.clockIn))
			.limit(activityType === 'time' ? limit : 20)
			.offset(activityType === 'time' ? offset : 0);

		activities.push(...timeData.map(t => ({
			id: t.id,
			type: 'time_entry',
			action: t.clockOut ? 'Clock In/Out' : 'Clock In',
			description: t.locationName ? `At ${t.locationName}` : 'Work session',
			details: { clockIn: t.clockIn, clockOut: t.clockOut, location: t.locationName },
			createdAt: t.createdAt
		})));
	}

	if (activityType === 'all' || activityType === 'tasks') {
		// Task completions
		const taskData = await db
			.select({
				id: taskCompletions.id,
				taskTitle: tasks.title,
				notes: taskCompletions.notes,
				createdAt: taskCompletions.completedAt
			})
			.from(taskCompletions)
			.leftJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(eq(taskCompletions.completedBy, selectedUserId))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(activityType === 'tasks' ? limit : 20)
			.offset(activityType === 'tasks' ? offset : 0);

		activities.push(...taskData.map(t => ({
			id: t.id,
			type: 'task_completion',
			action: 'Task Completed',
			description: t.taskTitle || 'Unknown task',
			details: { notes: t.notes },
			createdAt: t.createdAt
		})));
	}

	if (activityType === 'all' || activityType === 'pricing') {
		// Pricing decisions
		const pricingData = await db
			.select({
				id: pricingDecisions.id,
				itemName: pricingDecisions.itemName,
				price: pricingDecisions.price,
				destination: pricingDecisions.destination,
				locationName: locations.name,
				createdAt: pricingDecisions.createdAt
			})
			.from(pricingDecisions)
			.leftJoin(locations, eq(pricingDecisions.locationId, locations.id))
			.where(eq(pricingDecisions.userId, selectedUserId))
			.orderBy(desc(pricingDecisions.createdAt))
			.limit(activityType === 'pricing' ? limit : 20)
			.offset(activityType === 'pricing' ? offset : 0);

		activities.push(...pricingData.map(p => ({
			id: p.id,
			type: 'pricing_decision',
			action: 'Item Priced',
			description: `${p.itemName} - $${p.price} → ${p.destination}`,
			details: { price: p.price, destination: p.destination, location: p.locationName },
			createdAt: p.createdAt
		})));
	}

	if (activityType === 'all' || activityType === 'messages') {
		// Messages sent
		const messageData = await db
			.select({
				id: messages.id,
				content: messages.content,
				isSystemMessage: messages.isSystemMessage,
				createdAt: messages.createdAt
			})
			.from(messages)
			.where(and(eq(messages.senderId, selectedUserId), eq(messages.isSystemMessage, false)))
			.orderBy(desc(messages.createdAt))
			.limit(activityType === 'messages' ? limit : 20)
			.offset(activityType === 'messages' ? offset : 0);

		activities.push(...messageData.map(m => ({
			id: m.id,
			type: 'message',
			action: 'Message Sent',
			description: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
			details: null,
			createdAt: m.createdAt
		})));
	}

	if (activityType === 'all' || activityType === 'points') {
		// Point transactions
		const pointsData = await db
			.select({
				id: pointTransactions.id,
				points: pointTransactions.points,
				category: pointTransactions.category,
				action: pointTransactions.action,
				description: pointTransactions.description,
				createdAt: pointTransactions.earnedAt
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, selectedUserId))
			.orderBy(desc(pointTransactions.earnedAt))
			.limit(activityType === 'points' ? limit : 20)
			.offset(activityType === 'points' ? offset : 0);

		activities.push(...pointsData.map(p => ({
			id: p.id,
			type: 'points',
			action: `${p.points > 0 ? '+' : ''}${p.points} Points`,
			description: p.description || p.action,
			details: { points: p.points, category: p.category },
			createdAt: p.createdAt
		})));
	}

	if (activityType === 'all' || activityType === 'audit') {
		// Audit logs
		const auditData = await db
			.select({
				id: auditLogs.id,
				action: auditLogs.action,
				entityType: auditLogs.entityType,
				entityId: auditLogs.entityId,
				ipAddress: auditLogs.ipAddress,
				createdAt: auditLogs.createdAt
			})
			.from(auditLogs)
			.where(eq(auditLogs.userId, selectedUserId))
			.orderBy(desc(auditLogs.createdAt))
			.limit(activityType === 'audit' ? limit : 20)
			.offset(activityType === 'audit' ? offset : 0);

		activities.push(...auditData.map(a => ({
			id: a.id,
			type: 'audit',
			action: a.action,
			description: `${a.entityType}${a.entityId ? ` (${a.entityId.substring(0, 8)}...)` : ''}`,
			details: { entityType: a.entityType, entityId: a.entityId, ip: a.ipAddress },
			createdAt: a.createdAt
		})));
	}

	// Sort all activities by date descending
	activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

	// For "all" type, limit to most recent 100 entries
	if (activityType === 'all') {
		activities = activities.slice(0, 100);
		totalCount = activities.length;
	} else {
		// Get count for specific type
		const countQueries: Record<string, Promise<{ count: number }[]>> = {
			time: db.select({ count: sql<number>`count(*)` }).from(timeEntries).where(eq(timeEntries.userId, selectedUserId)),
			tasks: db.select({ count: sql<number>`count(*)` }).from(taskCompletions).where(eq(taskCompletions.completedBy, selectedUserId)),
			pricing: db.select({ count: sql<number>`count(*)` }).from(pricingDecisions).where(eq(pricingDecisions.userId, selectedUserId)),
			messages: db.select({ count: sql<number>`count(*)` }).from(messages).where(and(eq(messages.senderId, selectedUserId), eq(messages.isSystemMessage, false))),
			points: db.select({ count: sql<number>`count(*)` }).from(pointTransactions).where(eq(pointTransactions.userId, selectedUserId)),
			audit: db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(eq(auditLogs.userId, selectedUserId))
		};

		if (countQueries[activityType]) {
			const countResult = await countQueries[activityType];
			totalCount = countResult[0]?.count || 0;
		}
	}

	const totalPages = activityType === 'all' ? 1 : Math.ceil(totalCount / limit);

	return {
		users: allUsers,
		selectedUser,
		activities,
		activityType,
		page,
		totalPages,
		totalCount
	};
};
