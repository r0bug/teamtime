import type { User } from '$lib/server/db/schema';
import type { UserPermissions } from './permissions';

// Role hierarchy: admin > manager > purchaser > staff
export const ROLES = ['admin', 'manager', 'purchaser', 'staff'] as const;
export type UserRole = typeof ROLES[number];

export function isAdmin(user: User | null | undefined): boolean {
	return user?.role === 'admin';
}

export function isManager(user: User | null | undefined): boolean {
	return user?.role === 'manager' || user?.role === 'admin';
}

export function isPurchaser(user: User | null | undefined): boolean {
	return user?.role === 'purchaser' || isManager(user);
}

export function canAccessAdmin(user: User | null | undefined): boolean {
	return isManager(user);
}

export function canViewAllCommunications(user: User | null | undefined): boolean {
	return isAdmin(user);
}

export function canViewAuditLogs(user: User | null | undefined): boolean {
	return isAdmin(user);
}

export function canManageModules(user: User | null | undefined): boolean {
	return isAdmin(user);
}

export function canManageUsers(user: User | null | undefined): boolean {
	return isManager(user);
}

export function canManageLocations(user: User | null | undefined): boolean {
	return isManager(user);
}

export function canApprovePurchases(user: User | null | undefined): boolean {
	return isManager(user);
}

// ============================================
// GRANULAR PERMISSION HELPERS
// ============================================

/**
 * Check if user has permission to access a route or perform an action.
 * Uses granular permissions if available, falls back to role-based checks.
 *
 * @param user - The user to check
 * @param permissions - The user's cached permissions from locals.userPermissions
 * @param routePattern - The route pattern (e.g., '/admin/users')
 * @param actionName - Optional action name for action-level checks
 * @returns true if user has permission
 *
 * @example
 * // Page access check
 * if (!hasPermission(locals.user, locals.userPermissions, '/admin/users')) {
 *   throw redirect(302, '/dashboard');
 * }
 *
 * @example
 * // Action check
 * if (!hasPermission(locals.user, locals.userPermissions, '/admin/users', 'deleteUser')) {
 *   return fail(403, { error: 'Permission denied' });
 * }
 */
export function hasPermission(
	user: User | null | undefined,
	permissions: UserPermissions | null | undefined,
	routePattern: string,
	actionName?: string
): boolean {
	if (!user) return false;

	// If we have granular permissions, use them
	if (permissions) {
		// Check explicit deny first
		if (actionName) {
			const deniedActions = permissions.deniedActions.get(routePattern);
			if (deniedActions?.has(actionName)) return false;

			const grantedActions = permissions.grantedActions.get(routePattern);
			if (grantedActions?.has(actionName)) return true;
		} else {
			if (permissions.deniedRoutes.has(routePattern)) return false;
			if (permissions.grantedRoutes.has(routePattern)) return true;
		}
	}

	// Fall back to role-based checks for common patterns
	return checkRoleBasedPermission(user, permissions, routePattern);
}

/**
 * Internal role-based permission check
 */
function checkRoleBasedPermission(
	user: User,
	permissions: UserPermissions | null | undefined,
	routePattern: string
): boolean {
	// Use basedOnRole from user type if available
	const effectiveRole = permissions?.basedOnRole || user.role;

	// Admin routes
	if (routePattern.startsWith('/admin')) {
		return effectiveRole === 'admin' || user.role === 'admin';
	}

	// Manager-level routes
	const managerPatterns = ['/tasks/create', '/schedule/manage', '/purchases/approve', '/reports'];
	for (const pattern of managerPatterns) {
		if (routePattern.startsWith(pattern)) {
			return effectiveRole === 'admin' || effectiveRole === 'manager' ||
			       user.role === 'admin' || user.role === 'manager';
		}
	}

	// Purchaser-level routes
	const purchaserPatterns = ['/purchases/create', '/atm'];
	for (const pattern of purchaserPatterns) {
		if (routePattern.startsWith(pattern)) {
			return effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'purchaser' ||
			       user.role === 'admin' || user.role === 'manager' || user.role === 'purchaser';
		}
	}

	// Default: staff level (all authenticated users)
	return true;
}

/**
 * Check if user can manage access control settings
 */
export function canManageAccessControl(user: User | null | undefined): boolean {
	return isAdmin(user);
}
