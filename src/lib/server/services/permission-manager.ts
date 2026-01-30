// Permission Manager Service - Handles temporary permission changes for Office Manager AI
// Includes safety constraints, audit logging, and rollback capabilities

import { db, users, userTypes, permissions, temporaryPermissions, permissionChangeNotifications, auditLogs } from '$lib/server/db';
import { eq, and, or, lt, isNull, isNotNull, desc, sql } from 'drizzle-orm';

// Types
export interface PermissionChangeRequest {
	userId: string;
	changeType: 'permission_grant' | 'permission_revoke' | 'user_type_change';
	permissionId?: string;
	newUserTypeId?: string;
	expiresAt?: Date;
	justification: string;
	grantedByUserId?: string;
	grantedByAiRunId?: string;
}

export interface PermissionChangeResult {
	success: boolean;
	changeId?: string;
	requiresApproval?: boolean;
	error?: string;
	userNotified?: boolean;
}

export interface UserPermissionSummary {
	userId: string;
	userName: string;
	userRole: string;
	userTypeId?: string;
	userTypeName?: string;
	temporaryPermissions: {
		id: string;
		changeType: string;
		permissionName?: string;
		userTypeName?: string;
		expiresAt: Date | null;
		justification: string;
		grantedAt: Date;
	}[];
	pendingApprovals: number;
}

// Safety constraints
const PROTECTED_ROLES = ['admin']; // Cannot modify users with these roles
const PROTECTED_USER_TYPES = ['Admin']; // Cannot grant/revoke these user types
const SENSITIVE_PERMISSION_MODULES = ['admin', 'security', 'access-control']; // Require approval
const MAX_TEMPORARY_DURATION_HOURS = 168; // 1 week max for temporary permissions
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * Check if a user can be modified by Office Manager
 */
export async function canModifyUser(targetUserId: string): Promise<{ allowed: boolean; reason?: string }> {
	const user = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			userTypeId: users.userTypeId
		})
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);

	if (user.length === 0) {
		return { allowed: false, reason: 'User not found' };
	}

	// Check if user has a protected role
	if (PROTECTED_ROLES.includes(user[0].role)) {
		return { allowed: false, reason: `Cannot modify user with ${user[0].role} role` };
	}

	// Check if user has a protected user type
	if (user[0].userTypeId) {
		const userType = await db
			.select({ name: userTypes.name })
			.from(userTypes)
			.where(eq(userTypes.id, user[0].userTypeId))
			.limit(1);

		if (userType.length > 0 && PROTECTED_USER_TYPES.includes(userType[0].name)) {
			return { allowed: false, reason: `Cannot modify user with ${userType[0].name} user type` };
		}
	}

	return { allowed: true };
}

/**
 * Check if a permission change requires human approval
 */
export async function requiresApproval(request: PermissionChangeRequest): Promise<{ required: boolean; reason?: string }> {
	// User type changes to manager+ require approval
	if (request.changeType === 'user_type_change' && request.newUserTypeId) {
		const newType = await db
			.select({ name: userTypes.name, basedOnRole: userTypes.basedOnRole })
			.from(userTypes)
			.where(eq(userTypes.id, request.newUserTypeId))
			.limit(1);

		if (newType.length > 0) {
			if (['admin', 'manager'].includes(newType[0].basedOnRole || '')) {
				return { required: true, reason: `Promotion to ${newType[0].name} requires approval` };
			}
		}
	}

	// Sensitive module permissions require approval
	if (request.changeType === 'permission_grant' && request.permissionId) {
		const perm = await db
			.select({ module: permissions.module, name: permissions.name })
			.from(permissions)
			.where(eq(permissions.id, request.permissionId))
			.limit(1);

		if (perm.length > 0 && SENSITIVE_PERMISSION_MODULES.includes(perm[0].module)) {
			return { required: true, reason: `Permission ${perm[0].name} requires approval` };
		}
	}

	return { required: false };
}

/**
 * Get user's current permissions and active temporary changes
 */
export async function getUserPermissionSummary(userId: string): Promise<UserPermissionSummary | null> {
	const user = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			userTypeId: users.userTypeId
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (user.length === 0) {
		return null;
	}

	let userTypeName: string | undefined;
	if (user[0].userTypeId) {
		const ut = await db
			.select({ name: userTypes.name })
			.from(userTypes)
			.where(eq(userTypes.id, user[0].userTypeId))
			.limit(1);
		userTypeName = ut[0]?.name;
	}

	// Get active temporary permissions
	const tempPerms = await db
		.select({
			id: temporaryPermissions.id,
			changeType: temporaryPermissions.changeType,
			permissionId: temporaryPermissions.permissionId,
			newUserTypeId: temporaryPermissions.newUserTypeId,
			expiresAt: temporaryPermissions.expiresAt,
			justification: temporaryPermissions.justification,
			grantedAt: temporaryPermissions.grantedAt,
			approvalStatus: temporaryPermissions.approvalStatus
		})
		.from(temporaryPermissions)
		.where(and(
			eq(temporaryPermissions.userId, userId),
			eq(temporaryPermissions.isActive, true),
			or(
				isNull(temporaryPermissions.expiresAt),
				sql`${temporaryPermissions.expiresAt} > NOW()`
			)
		))
		.orderBy(desc(temporaryPermissions.grantedAt));

	// Enrich with permission/type names
	const enrichedPerms = await Promise.all(tempPerms.map(async (tp) => {
		let permissionName: string | undefined;
		let typeName: string | undefined;

		if (tp.permissionId) {
			const perm = await db
				.select({ name: permissions.name })
				.from(permissions)
				.where(eq(permissions.id, tp.permissionId))
				.limit(1);
			permissionName = perm[0]?.name;
		}

		if (tp.newUserTypeId) {
			const ut = await db
				.select({ name: userTypes.name })
				.from(userTypes)
				.where(eq(userTypes.id, tp.newUserTypeId))
				.limit(1);
			typeName = ut[0]?.name;
		}

		return {
			id: tp.id,
			changeType: tp.changeType,
			permissionName,
			userTypeName: typeName,
			expiresAt: tp.expiresAt,
			justification: tp.justification,
			grantedAt: tp.grantedAt
		};
	}));

	const pendingApprovals = tempPerms.filter(tp => tp.approvalStatus === 'pending').length;

	return {
		userId: user[0].id,
		userName: user[0].name,
		userRole: user[0].role,
		userTypeId: user[0].userTypeId ?? undefined,
		userTypeName,
		temporaryPermissions: enrichedPerms,
		pendingApprovals
	};
}

/**
 * Grant a temporary permission or user type change
 */
export async function grantTemporaryPermission(request: PermissionChangeRequest): Promise<PermissionChangeResult> {
	// Validate justification
	if (!request.justification || request.justification.length < MIN_JUSTIFICATION_LENGTH) {
		return { success: false, error: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters` };
	}

	// Check if user can be modified
	const canModify = await canModifyUser(request.userId);
	if (!canModify.allowed) {
		return { success: false, error: canModify.reason };
	}

	// Check if user type can be granted
	if (request.changeType === 'user_type_change' && request.newUserTypeId) {
		const newType = await db
			.select({ name: userTypes.name })
			.from(userTypes)
			.where(eq(userTypes.id, request.newUserTypeId))
			.limit(1);

		if (newType.length > 0 && PROTECTED_USER_TYPES.includes(newType[0].name)) {
			return { success: false, error: `Cannot grant ${newType[0].name} user type` };
		}
	}

	// Check expiration
	if (request.expiresAt) {
		const maxExpiry = new Date();
		maxExpiry.setHours(maxExpiry.getHours() + MAX_TEMPORARY_DURATION_HOURS);
		if (request.expiresAt > maxExpiry) {
			return { success: false, error: `Maximum temporary duration is ${MAX_TEMPORARY_DURATION_HOURS} hours` };
		}
	}

	// Check if approval is required
	const approval = await requiresApproval(request);
	const approvalStatus = approval.required ? 'pending' : 'auto_approved';

	// Get original user type for rollback
	let originalUserTypeId: string | undefined;
	if (request.changeType === 'user_type_change') {
		const user = await db
			.select({ userTypeId: users.userTypeId })
			.from(users)
			.where(eq(users.id, request.userId))
			.limit(1);
		originalUserTypeId = user[0]?.userTypeId ?? undefined;
	}

	// Create the temporary permission record
	const [change] = await db
		.insert(temporaryPermissions)
		.values({
			userId: request.userId,
			changeType: request.changeType,
			permissionId: request.permissionId,
			originalUserTypeId,
			newUserTypeId: request.newUserTypeId,
			expiresAt: request.expiresAt,
			justification: request.justification,
			grantedByUserId: request.grantedByUserId,
			grantedByAiRunId: request.grantedByAiRunId,
			approvalStatus,
			isActive: !approval.required, // Only active if auto-approved
			approvedAt: approval.required ? undefined : new Date()
		})
		.returning({ id: temporaryPermissions.id });

	// If auto-approved, apply the change immediately
	if (!approval.required) {
		await applyPermissionChange(change.id);
	}

	// Create notifications
	await createPermissionNotifications(change.id, request.userId, approval.required);

	// Audit log
	await db.insert(auditLogs).values({
		userId: request.grantedByUserId,
		action: approval.required ? 'permission_change_requested' : 'permission_change_applied',
		entityType: 'temporary_permission',
		entityId: change.id,
		afterData: {
			changeType: request.changeType,
			targetUserId: request.userId,
			permissionId: request.permissionId,
			newUserTypeId: request.newUserTypeId,
			justification: request.justification,
			approvalRequired: approval.required
		}
	});

	return {
		success: true,
		changeId: change.id,
		requiresApproval: approval.required,
		userNotified: true
	};
}

/**
 * Apply a permission change (after approval or for auto-approved changes)
 */
async function applyPermissionChange(changeId: string): Promise<void> {
	const change = await db
		.select()
		.from(temporaryPermissions)
		.where(eq(temporaryPermissions.id, changeId))
		.limit(1);

	if (change.length === 0) return;

	const c = change[0];

	if (c.changeType === 'user_type_change' && c.newUserTypeId) {
		await db
			.update(users)
			.set({ userTypeId: c.newUserTypeId, updatedAt: new Date() })
			.where(eq(users.id, c.userId));
	}
	// Note: permission_grant and permission_revoke changes are handled
	// by checking temporaryPermissions table in the permission check logic
}

/**
 * Rollback a temporary permission change
 */
export async function rollbackPermissionChange(changeId: string, rolledBackByUserId?: string): Promise<PermissionChangeResult> {
	const change = await db
		.select()
		.from(temporaryPermissions)
		.where(eq(temporaryPermissions.id, changeId))
		.limit(1);

	if (change.length === 0) {
		return { success: false, error: 'Permission change not found' };
	}

	const c = change[0];

	if (!c.isActive) {
		return { success: false, error: 'Permission change is not active' };
	}

	// Revert user type if applicable
	if (c.changeType === 'user_type_change' && c.originalUserTypeId) {
		await db
			.update(users)
			.set({ userTypeId: c.originalUserTypeId, updatedAt: new Date() })
			.where(eq(users.id, c.userId));
	}

	// Mark as rolled back
	await db
		.update(temporaryPermissions)
		.set({
			isActive: false,
			rolledBackAt: new Date(),
			rolledBackByUserId,
			updatedAt: new Date()
		})
		.where(eq(temporaryPermissions.id, changeId));

	// Audit log
	await db.insert(auditLogs).values({
		userId: rolledBackByUserId,
		action: 'permission_change_rolled_back',
		entityType: 'temporary_permission',
		entityId: changeId,
		afterData: { changeType: c.changeType, targetUserId: c.userId }
	});

	return { success: true, changeId };
}

/**
 * Approve a pending permission change
 */
export async function approvePermissionChange(changeId: string, approvedByUserId: string): Promise<PermissionChangeResult> {
	const change = await db
		.select()
		.from(temporaryPermissions)
		.where(and(
			eq(temporaryPermissions.id, changeId),
			eq(temporaryPermissions.approvalStatus, 'pending')
		))
		.limit(1);

	if (change.length === 0) {
		return { success: false, error: 'Pending change not found' };
	}

	// Check approver has permission (must be admin or manager)
	const approver = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, approvedByUserId))
		.limit(1);

	if (approver.length === 0 || !['admin', 'manager'].includes(approver[0].role)) {
		return { success: false, error: 'Only managers and admins can approve changes' };
	}

	// Update status
	await db
		.update(temporaryPermissions)
		.set({
			approvalStatus: 'approved',
			approvedByUserId,
			approvedAt: new Date(),
			isActive: true,
			updatedAt: new Date()
		})
		.where(eq(temporaryPermissions.id, changeId));

	// Apply the change
	await applyPermissionChange(changeId);

	// Audit log
	await db.insert(auditLogs).values({
		userId: approvedByUserId,
		action: 'permission_change_approved',
		entityType: 'temporary_permission',
		entityId: changeId,
		afterData: {}
	});

	return { success: true, changeId };
}

/**
 * Reject a pending permission change
 */
export async function rejectPermissionChange(changeId: string, rejectedByUserId: string, reason?: string): Promise<PermissionChangeResult> {
	const change = await db
		.select()
		.from(temporaryPermissions)
		.where(and(
			eq(temporaryPermissions.id, changeId),
			eq(temporaryPermissions.approvalStatus, 'pending')
		))
		.limit(1);

	if (change.length === 0) {
		return { success: false, error: 'Pending change not found' };
	}

	await db
		.update(temporaryPermissions)
		.set({
			approvalStatus: 'rejected',
			isActive: false,
			updatedAt: new Date(),
			metadata: { rejectionReason: reason }
		})
		.where(eq(temporaryPermissions.id, changeId));

	// Audit log
	await db.insert(auditLogs).values({
		userId: rejectedByUserId,
		action: 'permission_change_rejected',
		entityType: 'temporary_permission',
		entityId: changeId,
		afterData: { reason }
	});

	return { success: true, changeId };
}

/**
 * Get all pending approval requests
 */
export async function getPendingApprovals(): Promise<{
	id: string;
	userId: string;
	userName: string;
	changeType: string;
	permissionName?: string;
	userTypeName?: string;
	justification: string;
	grantedAt: Date;
}[]> {
	const pending = await db
		.select({
			id: temporaryPermissions.id,
			userId: temporaryPermissions.userId,
			changeType: temporaryPermissions.changeType,
			permissionId: temporaryPermissions.permissionId,
			newUserTypeId: temporaryPermissions.newUserTypeId,
			justification: temporaryPermissions.justification,
			grantedAt: temporaryPermissions.grantedAt
		})
		.from(temporaryPermissions)
		.where(eq(temporaryPermissions.approvalStatus, 'pending'))
		.orderBy(temporaryPermissions.grantedAt);

	return Promise.all(pending.map(async (p) => {
		const user = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, p.userId))
			.limit(1);

		let permissionName: string | undefined;
		let userTypeName: string | undefined;

		if (p.permissionId) {
			const perm = await db
				.select({ name: permissions.name })
				.from(permissions)
				.where(eq(permissions.id, p.permissionId))
				.limit(1);
			permissionName = perm[0]?.name;
		}

		if (p.newUserTypeId) {
			const ut = await db
				.select({ name: userTypes.name })
				.from(userTypes)
				.where(eq(userTypes.id, p.newUserTypeId))
				.limit(1);
			userTypeName = ut[0]?.name;
		}

		return {
			id: p.id,
			userId: p.userId,
			userName: user[0]?.name || 'Unknown',
			changeType: p.changeType,
			permissionName,
			userTypeName,
			justification: p.justification,
			grantedAt: p.grantedAt
		};
	}));
}

/**
 * Create notifications for permission changes
 */
async function createPermissionNotifications(changeId: string, targetUserId: string, requiresApproval: boolean): Promise<void> {
	// Notify the user
	await db.insert(permissionChangeNotifications).values({
		temporaryPermissionId: changeId,
		recipientUserId: targetUserId,
		notificationType: 'user',
		deliveryMethod: 'in_app'
	});

	// If requires approval, notify managers/admins
	if (requiresApproval) {
		const managers = await db
			.select({ id: users.id })
			.from(users)
			.where(or(
				eq(users.role, 'admin'),
				eq(users.role, 'manager')
			));

		for (const manager of managers) {
			await db.insert(permissionChangeNotifications).values({
				temporaryPermissionId: changeId,
				recipientUserId: manager.id,
				notificationType: 'manager',
				deliveryMethod: 'in_app'
			});
		}
	}
}

/**
 * Expire old temporary permissions
 */
export async function expireTemporaryPermissions(): Promise<number> {
	const expired = await db
		.select({
			id: temporaryPermissions.id,
			userId: temporaryPermissions.userId,
			changeType: temporaryPermissions.changeType,
			originalUserTypeId: temporaryPermissions.originalUserTypeId
		})
		.from(temporaryPermissions)
		.where(and(
			eq(temporaryPermissions.isActive, true),
			isNotNull(temporaryPermissions.expiresAt),
			lt(temporaryPermissions.expiresAt, new Date())
		));

	for (const e of expired) {
		// Revert user type if applicable
		if (e.changeType === 'user_type_change' && e.originalUserTypeId) {
			await db
				.update(users)
				.set({ userTypeId: e.originalUserTypeId, updatedAt: new Date() })
				.where(eq(users.id, e.userId));
		}

		// Mark as inactive
		await db
			.update(temporaryPermissions)
			.set({
				isActive: false,
				revokedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(temporaryPermissions.id, e.id));

		// Audit log
		await db.insert(auditLogs).values({
			action: 'permission_change_expired',
			entityType: 'temporary_permission',
			entityId: e.id,
			afterData: { changeType: e.changeType, targetUserId: e.userId }
		});
	}

	return expired.length;
}

/**
 * Get available user types that Office Manager can grant
 */
export async function getGrantableUserTypes(): Promise<{ id: string; name: string; description?: string; basedOnRole?: string }[]> {
	const types = await db
		.select({
			id: userTypes.id,
			name: userTypes.name,
			description: userTypes.description,
			basedOnRole: userTypes.basedOnRole
		})
		.from(userTypes)
		.where(eq(userTypes.isActive, true));

	// Filter out protected types and convert null to undefined
	return types
		.filter(t => !PROTECTED_USER_TYPES.includes(t.name))
		.map(t => ({
			id: t.id,
			name: t.name,
			description: t.description ?? undefined,
			basedOnRole: t.basedOnRole ?? undefined
		}));
}

/**
 * Get available permissions that Office Manager can grant
 */
export async function getGrantablePermissions(): Promise<{ id: string; name: string; module: string; description?: string }[]> {
	const perms = await db
		.select({
			id: permissions.id,
			name: permissions.name,
			module: permissions.module,
			description: permissions.description
		})
		.from(permissions);

	// Filter out sensitive modules (they'll require approval) and convert null to undefined
	return perms
		.filter(p => !SENSITIVE_PERMISSION_MODULES.includes(p.module))
		.map(p => ({
			id: p.id,
			name: p.name,
			module: p.module,
			description: p.description ?? undefined
		}));
}
