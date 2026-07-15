// Role gates + attribute-visibility filtering for the floorplan module.
//
// Modes (per spec): view = any staff-side user, edit (paint operational keys
// like vendor_id) = any staff-side role, build (geometry/config) = admin.
// Attribute visibility ladder: public < staff < admin; a viewer sees an
// attribute iff their rank >= the attr def's visibility rank. Keys with no
// attr def are treated as admin-visible/admin-editable (fail closed).

import type { User, FloorplanAttrDef } from '$lib/server/db/schema';
import { isAdmin, ROLES, type UserRole } from '$lib/server/auth/roles';

// Geometry/structure keys only Build mode (admin) may paint. Everything else
// with an attr def is an operational key any staff-side user may paint.
export const GEOMETRY_KEYS = new Set(['kind', 'door', 'label', 'level']);

const VISIBILITY_RANK: Record<string, number> = { public: 0, staff: 1, admin: 2 };

/** Any staff-side user (admin/manager/purchaser/staff). Vendor-portal-only users are not. */
export function canView(user: User | null | undefined): boolean {
	return !!user && (ROLES as readonly string[]).includes(user.role as UserRole);
}

export function canBuild(user: User | null | undefined): boolean {
	return isAdmin(user);
}

/** Viewer rank on the public(0) < staff(1) < admin(2) ladder. */
export function viewerRank(user: User | null | undefined): number {
	if (isAdmin(user)) return 2;
	return canView(user) ? 1 : 0;
}

export function canEditKey(
	user: User | null | undefined,
	key: string,
	defsByKey: Map<string, FloorplanAttrDef>
): boolean {
	if (!canView(user)) return false;
	if (isAdmin(user)) return true;
	if (GEOMETRY_KEYS.has(key)) return false;
	// Painting a key that has no definition implicitly defines it — Build only.
	if (!defsByKey.has(key)) return false;
	return true;
}

function keyRank(key: string, defsByKey: Map<string, FloorplanAttrDef>): number {
	const def = defsByKey.get(key);
	return def ? (VISIBILITY_RANK[def.visibility] ?? 2) : 2;
}

/** Drop attrs the viewer's rank may not see. */
export function filterAttrsByRank(
	attrs: Record<string, string>,
	defsByKey: Map<string, FloorplanAttrDef>,
	rank: number
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(attrs)) {
		if (keyRank(key, defsByKey) <= rank) out[key] = value;
	}
	return out;
}

export function visibleDefs(defs: FloorplanAttrDef[], rank: number): FloorplanAttrDef[] {
	return defs.filter((d) => (VISIBILITY_RANK[d.visibility] ?? 2) <= rank);
}

export function defsByKey(defs: FloorplanAttrDef[]): Map<string, FloorplanAttrDef> {
	return new Map(defs.map((d) => [d.key, d]));
}
