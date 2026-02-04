/**
 * Permission Enforcement Utilities
 *
 * Provides helpers to enforce the granular permission system across API endpoints.
 * These utilities integrate with the existing UserPermissions system loaded in hooks.server.ts.
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { hasPermission, hasRoutePermission, hasActionPermission } from './permissions';
import { isAdmin, isManager, isPurchaser } from './roles';
import type { UserPermissions } from './permissions';
import type { User } from '$lib/server/db/schema';

export interface PermissionCheckResult {
	allowed: boolean;
	reason?: string;
}

/**
 * Check if user has permission to access a route or perform an action
 * This is the primary function for permission checks in API routes
 */
export function checkPermission(
	user: User | null,
	permissions: UserPermissions | null,
	route: string,
	action?: string
): PermissionCheckResult {
	// Must be authenticated
	if (!user) {
		return { allowed: false, reason: 'Authentication required' };
	}

	// Admins bypass permission checks
	if (isAdmin(user)) {
		return { allowed: true };
	}

	// If we have granular permissions, use them
	if (permissions && (permissions.grantedRoutes.size > 0 || permissions.deniedRoutes.size > 0)) {
		const allowed = hasPermission(user, permissions, route, action);
		if (!allowed) {
			return {
				allowed: false,
				reason: action
					? `Permission denied for action '${action}' on route '${route}'`
					: `Permission denied for route '${route}'`
			};
		}
		return { allowed: true };
	}

	// Fall back to role-based checks for routes without granular permissions
	return checkRoleBasedAccess(user, route, action);
}

/**
 * Role-based access check fallback
 * Maps routes to required roles when granular permissions aren't configured
 */
function checkRoleBasedAccess(
	user: User,
	route: string,
	action?: string
): PermissionCheckResult {
	// Admin routes - require admin role
	if (route.startsWith('/admin') || route.startsWith('/api/admin')) {
		if (!isAdmin(user)) {
			return { allowed: false, reason: 'Admin access required' };
		}
		return { allowed: true };
	}

	// Manager-level routes
	const managerRoutes = [
		'/api/tasks/create',
		'/api/tasks/assign',
		'/api/schedule/manage',
		'/api/users/create',
		'/api/users/update',
		'/api/reports',
		'/api/purchases/approve',
		'/api/purchases/deny'
	];

	for (const managerRoute of managerRoutes) {
		if (route.startsWith(managerRoute)) {
			if (!isManager(user)) {
				return { allowed: false, reason: 'Manager access required' };
			}
			return { allowed: true };
		}
	}

	// Manager-level actions on resources
	const managerActions = [
		'create_task',
		'assign_task',
		'delete_task',
		'approve_purchase',
		'deny_purchase',
		'create_user',
		'update_user',
		'delete_user',
		'manage_schedule'
	];

	if (action && managerActions.includes(action)) {
		if (!isManager(user)) {
			return { allowed: false, reason: `Manager access required for ${action}` };
		}
		return { allowed: true };
	}

	// Purchaser-level routes
	const purchaserRoutes = ['/api/purchases/create', '/api/atm'];

	for (const purchaserRoute of purchaserRoutes) {
		if (route.startsWith(purchaserRoute)) {
			if (!isPurchaser(user) && !isManager(user)) {
				return { allowed: false, reason: 'Purchaser access required' };
			}
			return { allowed: true };
		}
	}

	// Default: allow access for authenticated users (staff level)
	return { allowed: true };
}

/**
 * Response helper for permission denied
 */
export function permissionDenied(reason: string = 'Permission denied') {
	return json({ error: reason }, { status: 403 });
}

/**
 * Response helper for authentication required
 */
export function authRequired() {
	return json({ error: 'Authentication required' }, { status: 401 });
}

/**
 * Utility to extract route pattern from a RequestEvent
 * Converts dynamic segments like [id] to a pattern
 */
export function getRoutePattern(event: RequestEvent): string {
	// Get the route ID from SvelteKit which includes the pattern
	const routeId = event.route.id;
	if (routeId) {
		return routeId;
	}

	// Fallback to pathname
	return event.url.pathname;
}

/**
 * Require authentication - returns error response if not authenticated
 */
export function requireAuth(event: RequestEvent): Response | null {
	if (!event.locals.user) {
		return authRequired();
	}
	return null;
}

/**
 * Require specific permission - returns error response if not allowed
 */
export function requirePermission(
	event: RequestEvent,
	action?: string
): Response | null {
	const { user, userPermissions } = event.locals;

	if (!user) {
		return authRequired();
	}

	const route = getRoutePattern(event);
	const result = checkPermission(user, userPermissions, route, action);

	if (!result.allowed) {
		return permissionDenied(result.reason);
	}

	return null;
}

/**
 * Require manager role - returns error response if not manager or above
 */
export function requireManager(event: RequestEvent): Response | null {
	const { user } = event.locals;

	if (!user) {
		return authRequired();
	}

	if (!isManager(user)) {
		return permissionDenied('Manager access required');
	}

	return null;
}

/**
 * Require admin role - returns error response if not admin
 */
export function requireAdmin(event: RequestEvent): Response | null {
	const { user } = event.locals;

	if (!user) {
		return authRequired();
	}

	if (!isAdmin(user)) {
		return permissionDenied('Admin access required');
	}

	return null;
}

/**
 * Check if user owns the resource or has manager access
 * Useful for routes where users can access their own data or managers can access all
 */
export function requireOwnerOrManager(
	event: RequestEvent,
	resourceOwnerId: string | null
): Response | null {
	const { user } = event.locals;

	if (!user) {
		return authRequired();
	}

	// Managers can access any resource
	if (isManager(user)) {
		return null;
	}

	// Users can access their own resources
	if (resourceOwnerId && user.id === resourceOwnerId) {
		return null;
	}

	return permissionDenied('You can only access your own resources');
}

/**
 * Decorator-style permission check that can be used at the start of handlers
 *
 * Example usage:
 * ```ts
 * export const POST: RequestHandler = async (event) => {
 *   const authError = requireAuth(event);
 *   if (authError) return authError;
 *
 *   const permError = requirePermission(event, 'create_task');
 *   if (permError) return permError;
 *
 *   // ... rest of handler
 * };
 * ```
 */
export type PermissionGuard = (event: RequestEvent) => Response | null;

/**
 * Combine multiple permission guards
 * Returns the first error encountered, or null if all pass
 */
export function combineGuards(...guards: PermissionGuard[]): PermissionGuard {
	return (event: RequestEvent) => {
		for (const guard of guards) {
			const error = guard(event);
			if (error) return error;
		}
		return null;
	};
}
