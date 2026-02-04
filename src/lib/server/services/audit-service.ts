/**
 * Audit Logging Service
 *
 * Provides comprehensive audit logging for security-sensitive actions.
 * All audit entries are persisted to the database and can be queried for compliance.
 */

import { db, auditLogs, users } from '$lib/server/db';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('audit-service');

// Standard audit action types
export type AuditAction =
	// Authentication
	| 'login_success'
	| 'login_failed'
	| 'logout'
	| '2fa_success'
	| '2fa_failed'
	| 'account_locked'
	| 'account_unlocked'
	| 'password_changed'
	| 'pin_changed'
	// User management
	| 'user_created'
	| 'user_updated'
	| 'user_deleted'
	| 'user_deactivated'
	| 'user_reactivated'
	| 'role_changed'
	| 'permission_granted'
	| 'permission_revoked'
	// Time tracking
	| 'clock_in'
	| 'clock_out'
	| 'time_entry_created'
	| 'time_entry_updated'
	| 'time_entry_deleted'
	| 'time_entry_approved'
	// Tasks
	| 'task_created'
	| 'task_updated'
	| 'task_deleted'
	| 'task_assigned'
	| 'task_completed'
	| 'task_cancelled'
	// Purchases/Expenses
	| 'purchase_created'
	| 'purchase_approved'
	| 'purchase_denied'
	| 'expense_created'
	| 'expense_updated'
	| 'withdrawal_created'
	// Inventory/Pricing
	| 'item_created'
	| 'item_priced'
	| 'item_sold'
	| 'inventory_drop_created'
	| 'inventory_drop_processed'
	// Messages
	| 'message_sent'
	| 'conversation_created'
	// Schedule
	| 'schedule_created'
	| 'schedule_updated'
	| 'schedule_deleted'
	| 'shift_swap_requested'
	| 'shift_swap_approved'
	// System
	| 'setting_changed'
	| 'data_export'
	| 'data_import'
	// Generic CRUD
	| 'create'
	| 'read'
	| 'update'
	| 'delete';

// Entity types that can be audited
export type AuditEntityType =
	| 'user'
	| 'session'
	| 'task'
	| 'time_entry'
	| 'schedule'
	| 'purchase'
	| 'expense'
	| 'withdrawal'
	| 'message'
	| 'conversation'
	| 'item'
	| 'pricing_decision'
	| 'inventory_drop'
	| 'setting'
	| 'permission'
	| 'notification'
	| 'achievement'
	| 'demerit'
	| 'shoutout'
	| 'group';

export interface AuditLogEntry {
	userId: string | null;
	action: AuditAction | string;
	entityType: AuditEntityType | string;
	entityId?: string | null;
	beforeData?: Record<string, unknown> | null;
	afterData?: Record<string, unknown> | null;
	ipAddress?: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Record an audit log entry
 */
export async function audit(entry: AuditLogEntry): Promise<void> {
	try {
		await db.insert(auditLogs).values({
			userId: entry.userId,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId || null,
			beforeData: entry.beforeData || null,
			afterData: entry.afterData ? { ...entry.afterData, ...entry.metadata } : entry.metadata || null,
			ipAddress: entry.ipAddress || null
		});

		// Also log to application logger for real-time monitoring
		log.info({
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			userId: entry.userId
		}, `Audit: ${entry.action} on ${entry.entityType}`);
	} catch (error) {
		// Don't throw - audit logging should not break the main flow
		log.error({ error, entry }, 'Failed to record audit log');
	}
}

/**
 * Audit a login attempt
 */
export async function auditLogin(params: {
	userId: string | null;
	email: string;
	success: boolean;
	reason?: string;
	ipAddress: string;
	userAgent?: string;
}): Promise<void> {
	await audit({
		userId: params.userId,
		action: params.success ? 'login_success' : 'login_failed',
		entityType: 'session',
		afterData: {
			email: params.email,
			success: params.success,
			reason: params.reason,
			userAgent: params.userAgent
		},
		ipAddress: params.ipAddress
	});
}

/**
 * Audit a clock in/out event
 */
export async function auditClockEvent(params: {
	userId: string;
	timeEntryId: string;
	action: 'clock_in' | 'clock_out';
	locationId?: string;
	latitude?: number;
	longitude?: number;
	ipAddress?: string;
}): Promise<void> {
	await audit({
		userId: params.userId,
		action: params.action,
		entityType: 'time_entry',
		entityId: params.timeEntryId,
		afterData: {
			locationId: params.locationId,
			latitude: params.latitude,
			longitude: params.longitude
		},
		ipAddress: params.ipAddress
	});
}

/**
 * Audit a task action
 */
export async function auditTask(params: {
	userId: string;
	taskId: string;
	action: 'task_created' | 'task_updated' | 'task_deleted' | 'task_assigned' | 'task_completed' | 'task_cancelled';
	beforeData?: Record<string, unknown>;
	afterData?: Record<string, unknown>;
	ipAddress?: string;
}): Promise<void> {
	await audit({
		userId: params.userId,
		action: params.action,
		entityType: 'task',
		entityId: params.taskId,
		beforeData: params.beforeData,
		afterData: params.afterData,
		ipAddress: params.ipAddress
	});
}

/**
 * Audit a purchase/expense action
 */
export async function auditPurchase(params: {
	userId: string;
	purchaseId: string;
	action: 'purchase_created' | 'purchase_approved' | 'purchase_denied';
	amount?: number;
	approverNotes?: string;
	ipAddress?: string;
}): Promise<void> {
	await audit({
		userId: params.userId,
		action: params.action,
		entityType: 'purchase',
		entityId: params.purchaseId,
		afterData: {
			amount: params.amount,
			approverNotes: params.approverNotes
		},
		ipAddress: params.ipAddress
	});
}

/**
 * Audit a user management action
 */
export async function auditUserManagement(params: {
	actorId: string;
	targetUserId: string;
	action: 'user_created' | 'user_updated' | 'user_deleted' | 'user_deactivated' | 'user_reactivated' | 'role_changed' | 'permission_granted' | 'permission_revoked';
	beforeData?: Record<string, unknown>;
	afterData?: Record<string, unknown>;
	ipAddress?: string;
}): Promise<void> {
	await audit({
		userId: params.actorId,
		action: params.action,
		entityType: 'user',
		entityId: params.targetUserId,
		beforeData: params.beforeData,
		afterData: params.afterData,
		ipAddress: params.ipAddress
	});
}

/**
 * Audit a setting change
 */
export async function auditSettingChange(params: {
	userId: string;
	settingKey: string;
	oldValue: unknown;
	newValue: unknown;
	ipAddress?: string;
}): Promise<void> {
	await audit({
		userId: params.userId,
		action: 'setting_changed',
		entityType: 'setting',
		entityId: params.settingKey,
		beforeData: { value: params.oldValue },
		afterData: { value: params.newValue },
		ipAddress: params.ipAddress
	});
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(params: {
	userId?: string;
	action?: string;
	entityType?: string;
	entityId?: string;
	startDate?: Date;
	endDate?: Date;
	limit?: number;
	offset?: number;
}): Promise<{
	logs: Array<{
		id: string;
		userId: string | null;
		userName: string | null;
		action: string;
		entityType: string;
		entityId: string | null;
		beforeData: Record<string, unknown> | null;
		afterData: Record<string, unknown> | null;
		ipAddress: string | null;
		createdAt: Date;
	}>;
	total: number;
}> {
	const conditions = [];

	if (params.userId) {
		conditions.push(eq(auditLogs.userId, params.userId));
	}
	if (params.action) {
		conditions.push(eq(auditLogs.action, params.action));
	}
	if (params.entityType) {
		conditions.push(eq(auditLogs.entityType, params.entityType));
	}
	if (params.entityId) {
		conditions.push(eq(auditLogs.entityId, params.entityId));
	}
	if (params.startDate) {
		conditions.push(gte(auditLogs.createdAt, params.startDate));
	}
	if (params.endDate) {
		conditions.push(lte(auditLogs.createdAt, params.endDate));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	const limit = params.limit || 50;
	const offset = params.offset || 0;

	const [logs, countResult] = await Promise.all([
		db
			.select({
				id: auditLogs.id,
				userId: auditLogs.userId,
				userName: users.name,
				action: auditLogs.action,
				entityType: auditLogs.entityType,
				entityId: auditLogs.entityId,
				beforeData: auditLogs.beforeData,
				afterData: auditLogs.afterData,
				ipAddress: auditLogs.ipAddress,
				createdAt: auditLogs.createdAt
			})
			.from(auditLogs)
			.leftJoin(users, eq(users.id, auditLogs.userId))
			.where(whereClause)
			.orderBy(desc(auditLogs.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(auditLogs)
			.where(whereClause)
	]);

	return {
		logs,
		total: countResult[0]?.count || 0
	};
}

/**
 * Get recent activity for a specific user
 */
export async function getUserActivity(userId: string, limit = 20): Promise<Array<{
	action: string;
	entityType: string;
	entityId: string | null;
	createdAt: Date;
}>> {
	return db
		.select({
			action: auditLogs.action,
			entityType: auditLogs.entityType,
			entityId: auditLogs.entityId,
			createdAt: auditLogs.createdAt
		})
		.from(auditLogs)
		.where(eq(auditLogs.userId, userId))
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit);
}

/**
 * Get audit summary statistics
 */
export async function getAuditStats(startDate: Date, endDate: Date): Promise<{
	totalEntries: number;
	byAction: Record<string, number>;
	byEntityType: Record<string, number>;
	uniqueUsers: number;
}> {
	const [total, byAction, byEntityType, uniqueUsers] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(auditLogs)
			.where(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate))),
		db
			.select({
				action: auditLogs.action,
				count: sql<number>`count(*)::int`
			})
			.from(auditLogs)
			.where(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate)))
			.groupBy(auditLogs.action),
		db
			.select({
				entityType: auditLogs.entityType,
				count: sql<number>`count(*)::int`
			})
			.from(auditLogs)
			.where(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate)))
			.groupBy(auditLogs.entityType),
		db
			.select({ count: sql<number>`count(distinct user_id)::int` })
			.from(auditLogs)
			.where(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate)))
	]);

	const actionCounts: Record<string, number> = {};
	for (const row of byAction) {
		actionCounts[row.action] = row.count;
	}

	const entityCounts: Record<string, number> = {};
	for (const row of byEntityType) {
		entityCounts[row.entityType] = row.count;
	}

	return {
		totalEntries: total[0]?.count || 0,
		byAction: actionCounts,
		byEntityType: entityCounts,
		uniqueUsers: uniqueUsers[0]?.count || 0
	};
}

/**
 * Clean up old audit logs (for compliance with retention policies)
 */
export async function cleanupOldAuditLogs(retentionDays: number): Promise<number> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

	const result = await db
		.delete(auditLogs)
		.where(lte(auditLogs.createdAt, cutoffDate))
		.returning({ id: auditLogs.id });

	log.info({ deletedCount: result.length, cutoffDate: cutoffDate.toISOString() }, 'Cleaned up old audit logs');

	return result.length;
}
