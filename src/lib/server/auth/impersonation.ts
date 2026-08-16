/**
 * Impersonated-session de-privileging.
 *
 * `POST /api/app/impersonate-vendor` lets a manager "act as" a vendor from the label
 * app's staff mode. It does that by minting a Lucia session for `vendors.userId` — and
 * some vendor accounts are linked to staff or admin logins (Storlie's Relics is linked
 * to an admin). Without a clamp, impersonating such a vendor hands the caller that
 * user's real role, which is a manager -> admin privilege escalation.
 *
 * The clamp cannot live in the endpoint as "refuse to impersonate an admin": the owner
 * legitimately holds the house vendor accounts (SR, YFGS, YFB, YFMEDIA), so that check
 * would break the supported case. Privilege here is a property of the SESSION, not the
 * user — the same person is legitimately a full admin in their browser and vendor-only
 * in a label-app impersonation session at the same moment. Nothing attached to the user
 * (a role, a user type, a security group) can express that, so the clamp is applied per
 * request in hooks.server.ts against `sessions.context_vendor_id`.
 */

import type { User } from '$lib/server/db/schema';
import type { UserPermissions } from './permissions';

/** Identity an impersonated session sees, regardless of the underlying user's role. */
export type ClampedUser = User & { extraRoles: string[] };

/**
 * Build the effective identity for a request.
 *
 * When impersonating, the role is forced to the bottom of the hierarchy so every
 * `isManager()` / `isAdmin()` gate fails closed, while `extraRoles: ['vendor']` keeps
 * `isVendor()` true so the vendor endpoints the label app depends on still work.
 */
export function applyImpersonationClamp(
	fullUser: User,
	extraRoles: string[],
	isImpersonated: boolean
): ClampedUser {
	if (!isImpersonated) return { ...fullUser, extraRoles };
	return { ...fullUser, role: 'staff', extraRoles: ['vendor'] };
}

/**
 * Permissions an impersonated session gets: none granted, none denied.
 *
 * With nothing granted, `hasPermission()` falls through to the role-based check, which
 * denies `/admin` because the effective role is 'staff'. Returned fresh each call so a
 * caller mutating the Sets cannot poison other requests.
 */
export function vendorOnlyPermissions(): UserPermissions {
	return {
		userTypeId: null,
		userTypeName: null,
		basedOnRole: 'staff',
		grantedRoutes: new Set(),
		deniedRoutes: new Set(),
		grantedActions: new Map(),
		deniedActions: new Map()
	};
}
