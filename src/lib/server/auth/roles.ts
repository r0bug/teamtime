import type { User } from '$lib/server/db/schema';

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
