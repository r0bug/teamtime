// Granular Access Control Service
// Provides permission checking at both page and action levels

import { db, users, userTypes, permissions, userTypePermissions } from '$lib/server/db';
import { eq, and, inArray } from 'drizzle-orm';
import { isAdmin, isManager, isPurchaser } from './roles';
import type { User, UserType, Permission, UserTypePermission } from '$lib/server/db/schema';

// Cached permission set for a user
export interface UserPermissions {
	userTypeId: string | null;
	userTypeName: string | null;
	basedOnRole: User['role'] | null;
	grantedRoutes: Set<string>; // Routes with page access
	deniedRoutes: Set<string>; // Explicitly denied routes
	grantedActions: Map<string, Set<string>>; // route -> actions with access
	deniedActions: Map<string, Set<string>>; // route -> explicitly denied actions
}

/**
 * Get all permissions for a user, returning a cached-friendly structure
 * Call this on request start and store in locals
 */
export async function getUserPermissions(user: User): Promise<UserPermissions> {
	const result: UserPermissions = {
		userTypeId: null,
		userTypeName: null,
		basedOnRole: null,
		grantedRoutes: new Set(),
		deniedRoutes: new Set(),
		grantedActions: new Map(),
		deniedActions: new Map()
	};

	// Get user's custom type if they have one
	const userTypeId = user.userTypeId;

	if (!userTypeId) {
		// No custom type - user will rely on role-based fallback
		return result;
	}

	// Get the user type
	const [userType] = await db
		.select()
		.from(userTypes)
		.where(eq(userTypes.id, userTypeId))
		.limit(1);

	if (!userType || !userType.isActive) {
		return result;
	}

	result.userTypeId = userType.id;
	result.userTypeName = userType.name;
	result.basedOnRole = userType.basedOnRole;

	// Get all permissions for this user type
	const typePermissions = await db
		.select({
			routePattern: permissions.routePattern,
			actionName: permissions.actionName,
			granted: userTypePermissions.granted
		})
		.from(userTypePermissions)
		.innerJoin(permissions, eq(userTypePermissions.permissionId, permissions.id))
		.where(eq(userTypePermissions.userTypeId, userTypeId));

	// Build the permission sets
	for (const perm of typePermissions) {
		if (perm.actionName) {
			// Action-level permission
			if (perm.granted) {
				if (!result.grantedActions.has(perm.routePattern)) {
					result.grantedActions.set(perm.routePattern, new Set());
				}
				result.grantedActions.get(perm.routePattern)!.add(perm.actionName);
			} else {
				if (!result.deniedActions.has(perm.routePattern)) {
					result.deniedActions.set(perm.routePattern, new Set());
				}
				result.deniedActions.get(perm.routePattern)!.add(perm.actionName);
			}
		} else {
			// Page-level permission
			if (perm.granted) {
				result.grantedRoutes.add(perm.routePattern);
			} else {
				result.deniedRoutes.add(perm.routePattern);
			}
		}
	}

	return result;
}

/**
 * Check if user has permission to access a route (page level)
 * Uses cached permissions from getUserPermissions
 */
export function hasRoutePermission(
	user: User,
	permissions: UserPermissions,
	routePattern: string
): boolean {
	// Check explicit deny first
	if (permissions.deniedRoutes.has(routePattern)) {
		return false;
	}

	// Check explicit grant
	if (permissions.grantedRoutes.has(routePattern)) {
		return true;
	}

	// Fall back to role-based check
	return checkRoleBasedPermission(user, permissions, routePattern);
}

/**
 * Check if user has permission to perform an action on a route
 * Uses cached permissions from getUserPermissions
 */
export function hasActionPermission(
	user: User,
	permissions: UserPermissions,
	routePattern: string,
	actionName: string
): boolean {
	// Check explicit action deny
	const deniedActions = permissions.deniedActions.get(routePattern);
	if (deniedActions?.has(actionName)) {
		return false;
	}

	// Check explicit action grant
	const grantedActions = permissions.grantedActions.get(routePattern);
	if (grantedActions?.has(actionName)) {
		return true;
	}

	// Fall back to page permission (if can access page, can do actions by default)
	return hasRoutePermission(user, permissions, routePattern);
}

/**
 * Combined permission check - works for both page and action level
 */
export function hasPermission(
	user: User,
	permissions: UserPermissions,
	routePattern: string,
	actionName?: string
): boolean {
	if (actionName) {
		return hasActionPermission(user, permissions, routePattern, actionName);
	}
	return hasRoutePermission(user, permissions, routePattern);
}

/**
 * Role-based permission fallback
 * Maps routes to role requirements based on existing patterns
 */
function checkRoleBasedPermission(
	user: User,
	permissions: UserPermissions,
	routePattern: string
): boolean {
	// Use basedOnRole from user type if available, otherwise use user's direct role
	const effectiveRole = permissions.basedOnRole || user.role;

	// Admin routes - require admin
	if (routePattern.startsWith('/admin')) {
		return isAdmin(user) || effectiveRole === 'admin';
	}

	// Manager-level routes
	const managerRoutes = [
		'/tasks/create',
		'/schedule/manage',
		'/purchases/approve',
		'/reports'
	];
	for (const route of managerRoutes) {
		if (routePattern.startsWith(route)) {
			return isManager(user) || effectiveRole === 'admin' || effectiveRole === 'manager';
		}
	}

	// Purchaser-level routes
	const purchaserRoutes = [
		'/purchases/create',
		'/atm'
	];
	for (const route of purchaserRoutes) {
		if (routePattern.startsWith(route)) {
			return isPurchaser(user) || effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'purchaser';
		}
	}

	// Default: allow access (staff level)
	return true;
}

/**
 * Get all permissions in the system, grouped by module
 */
export async function getAllPermissions(): Promise<Map<string, Permission[]>> {
	const allPerms = await db
		.select()
		.from(permissions)
		.orderBy(permissions.module, permissions.routePattern, permissions.actionName);

	const byModule = new Map<string, Permission[]>();
	for (const perm of allPerms) {
		if (!byModule.has(perm.module)) {
			byModule.set(perm.module, []);
		}
		byModule.get(perm.module)!.push(perm);
	}

	return byModule;
}

/**
 * Get all user types
 */
export async function getAllUserTypes(): Promise<UserType[]> {
	return db
		.select()
		.from(userTypes)
		.orderBy(userTypes.priority, userTypes.name);
}

/**
 * Get permission matrix - which user types have which permissions
 */
export async function getPermissionMatrix(): Promise<{
	userTypes: UserType[];
	permissions: Permission[];
	matrix: Map<string, Map<string, boolean>>; // userTypeId -> permissionId -> granted
}> {
	const [allUserTypes, allPermissions, allAssignments] = await Promise.all([
		getAllUserTypes(),
		db.select().from(permissions).orderBy(permissions.module, permissions.routePattern),
		db.select().from(userTypePermissions)
	]);

	// Build matrix
	const matrix = new Map<string, Map<string, boolean>>();
	for (const ut of allUserTypes) {
		matrix.set(ut.id, new Map());
	}

	for (const assignment of allAssignments) {
		const userTypeMap = matrix.get(assignment.userTypeId);
		if (userTypeMap) {
			userTypeMap.set(assignment.permissionId, assignment.granted);
		}
	}

	return {
		userTypes: allUserTypes,
		permissions: allPermissions,
		matrix
	};
}

/**
 * Create or update a user type
 */
export async function upsertUserType(data: {
	id?: string;
	name: string;
	description?: string;
	basedOnRole?: User['role'];
	priority?: number;
	color?: string;
	isActive?: boolean;
}): Promise<UserType> {
	if (data.id) {
		// Update existing
		const [updated] = await db
			.update(userTypes)
			.set({
				name: data.name,
				description: data.description,
				basedOnRole: data.basedOnRole,
				priority: data.priority ?? 50,
				color: data.color ?? '#6B7280',
				isActive: data.isActive ?? true,
				updatedAt: new Date()
			})
			.where(eq(userTypes.id, data.id))
			.returning();
		return updated;
	} else {
		// Create new
		const [created] = await db
			.insert(userTypes)
			.values({
				name: data.name,
				description: data.description,
				basedOnRole: data.basedOnRole,
				priority: data.priority ?? 50,
				color: data.color ?? '#6B7280',
				isActive: data.isActive ?? true
			})
			.returning();
		return created;
	}
}

/**
 * Set permission for a user type
 */
export async function setUserTypePermission(
	userTypeId: string,
	permissionId: string,
	granted: boolean
): Promise<void> {
	// Upsert the permission assignment
	await db
		.insert(userTypePermissions)
		.values({
			userTypeId,
			permissionId,
			granted
		})
		.onConflictDoUpdate({
			target: [userTypePermissions.userTypeId, userTypePermissions.permissionId],
			set: { granted, createdAt: new Date() }
		});
}

/**
 * Remove permission assignment from a user type
 */
export async function removeUserTypePermission(
	userTypeId: string,
	permissionId: string
): Promise<void> {
	await db
		.delete(userTypePermissions)
		.where(
			and(
				eq(userTypePermissions.userTypeId, userTypeId),
				eq(userTypePermissions.permissionId, permissionId)
			)
		);
}

/**
 * Assign a user type to a user
 */
export async function assignUserType(userId: string, userTypeId: string | null): Promise<void> {
	await db
		.update(users)
		.set({
			userTypeId,
			updatedAt: new Date()
		})
		.where(eq(users.id, userId));
}

/**
 * Create system user types based on existing roles
 */
export async function seedSystemUserTypes(): Promise<void> {
	const systemTypes = [
		{ name: 'Admin', basedOnRole: 'admin' as const, priority: 100, color: '#DC2626', isSystem: true },
		{ name: 'Manager', basedOnRole: 'manager' as const, priority: 80, color: '#2563EB', isSystem: true },
		{ name: 'Purchaser', basedOnRole: 'purchaser' as const, priority: 60, color: '#059669', isSystem: true },
		{ name: 'Staff', basedOnRole: 'staff' as const, priority: 40, color: '#6B7280', isSystem: true }
	];

	for (const type of systemTypes) {
		// Check if already exists
		const [existing] = await db
			.select()
			.from(userTypes)
			.where(eq(userTypes.name, type.name))
			.limit(1);

		if (!existing) {
			await db.insert(userTypes).values(type);
		}
	}
}
