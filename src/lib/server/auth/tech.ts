/**
 * Tech/Support access layer — the "support attribute" on top of roles.
 *
 * Problem: "manager" bundles retail authority (schedules, tasks, vendors)
 * with tech authority (credential resets, printer/print-queue management,
 * label formats, app releases). Some managers should not hold the tech half,
 * and support staff need the tech half without full manager access.
 *
 * Mechanism: reuses the EXISTING user-type permission system (user_types +
 * permissions + user_type_permissions, managed at /admin/settings/
 * access-control). Tech capabilities are catalog entries under the 'tech'
 * module with pseudo route patterns ('tech:credentials', ...). At each
 * tech-sensitive gate: an explicit user-type DENY blocks (even a manager),
 * an explicit GRANT allows (even plain staff), otherwise the gate's original
 * role check applies unchanged — so nothing changes for anyone until a user
 * is assigned a type that says otherwise.
 *
 * Two seeded types (see seedTechPermissionsAndTypes):
 *   "Tech Support"     — based on staff,   all tech:* GRANTED
 *   "Manager (Retail)" — based on manager, all tech:* DENIED
 */
import { db } from '$lib/server/db';
import { permissions, userTypes, userTypePermissions } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const TECH = {
	/** Reset staff PINs/passwords, unlock staff accounts */
	credentials: 'tech:credentials',
	/** Vendor portal credentials: enable/disable portal, temp passwords, resets, unlocks, invites */
	vendorCredentials: 'tech:vendor-credentials',
	/** Printer registry: add/edit printers, check units out to vendors */
	printers: 'tech:printers',
	/** Print-queue ops on behalf of vendors (by-vendorId admin print API + Labels hub) */
	printQueue: 'tech:print-queue',
	/** Label format catalog (sizes/ZPL templates) */
	labelFormats: 'tech:label-formats',
	/** Desktop label-app releases: staged installers, archived versions */
	appReleases: 'tech:app-releases',
	/** FleetDeck support console (fleet health/actions) — consumed by FleetDeck, not TeamTime routes */
	fleetSupport: 'tech:fleet-support'
} as const;

export type TechKey = (typeof TECH)[keyof typeof TECH];

/**
 * The gate: explicit deny > explicit grant > the gate's pre-existing role
 * check. Pass the ORIGINAL check as `roleFallback` so un-typed users keep
 * exactly the behavior they had before this layer existed.
 */
export function hasTechAccess(
	locals: App.Locals,
	key: TechKey,
	roleFallback: (user: NonNullable<App.Locals['user']>) => boolean
): boolean {
	const user = locals.user;
	if (!user) return false;
	const p = locals.userPermissions;
	if (p) {
		if (p.deniedRoutes.has(key)) return false;
		if (p.grantedRoutes.has(key)) return true;
	}
	return roleFallback(user);
}

const TECH_CATALOG: { key: TechKey; name: string; description: string }[] = [
	{ key: TECH.credentials, name: 'Staff credentials', description: 'Reset staff PINs/passwords, unlock accounts' },
	{ key: TECH.vendorCredentials, name: 'Vendor credentials', description: 'Vendor portal access: enable/disable, temp passwords, resets, unlocks, invites' },
	{ key: TECH.printers, name: 'Printer registry', description: 'Manage printers, check units out to vendors' },
	{ key: TECH.printQueue, name: 'Print queue (staff-side)', description: 'Print/ack tags on behalf of vendors; Labels & Tags hub' },
	{ key: TECH.labelFormats, name: 'Label formats', description: 'Manage the label size/ZPL format catalog' },
	{ key: TECH.appReleases, name: 'App releases', description: 'Staged installers and archived label-app versions' },
	{ key: TECH.fleetSupport, name: 'Fleet support console', description: 'FleetDeck: fleet health, remote support actions' }
];

/**
 * Idempotent: creates the tech permission rows plus the two user types with
 * their grant/deny sets. Runs from the access-control admin "seed" action.
 */
export async function seedTechPermissionsAndTypes(): Promise<void> {
	const permIds = new Map<string, string>();
	for (const item of TECH_CATALOG) {
		const [existing] = await db
			.select({ id: permissions.id })
			.from(permissions)
			.where(eq(permissions.routePattern, item.key))
			.limit(1);
		if (existing) {
			permIds.set(item.key, existing.id);
		} else {
			const [row] = await db
				.insert(permissions)
				.values({
					routePattern: item.key,
					actionName: null,
					name: item.name,
					description: item.description,
					module: 'tech',
					isAutoDiscovered: false,
					defaultGranted: false
				})
				.returning({ id: permissions.id });
			permIds.set(item.key, row.id);
		}
	}

	const seedTypes: { name: string; description: string; basedOnRole: 'staff' | 'manager'; priority: number; color: string; granted: boolean }[] = [
		{
			name: 'Tech Support',
			description: 'Support/tech staff: full tech access (credentials, printers, print queue, releases, fleet console) without manager-level retail authority',
			basedOnRole: 'staff',
			priority: 70,
			color: '#7C3AED',
			granted: true
		},
		{
			name: 'Manager (Retail)',
			description: 'Manager without the tech half: keeps schedules/tasks/vendors, loses credential resets, printer/print-queue management, and releases',
			basedOnRole: 'manager',
			priority: 75,
			color: '#D97706',
			granted: false
		}
	];

	for (const t of seedTypes) {
		let [typeRow] = await db
			.select({ id: userTypes.id })
			.from(userTypes)
			.where(eq(userTypes.name, t.name))
			.limit(1);
		if (!typeRow) {
			[typeRow] = await db
				.insert(userTypes)
				.values({
					name: t.name,
					description: t.description,
					basedOnRole: t.basedOnRole,
					priority: t.priority,
					color: t.color,
					isSystem: false
				})
				.returning({ id: userTypes.id });
		}
		for (const item of TECH_CATALOG) {
			const permissionId = permIds.get(item.key)!;
			const [existing] = await db
				.select({ id: userTypePermissions.id })
				.from(userTypePermissions)
				.where(and(eq(userTypePermissions.userTypeId, typeRow.id), eq(userTypePermissions.permissionId, permissionId)))
				.limit(1);
			if (!existing) {
				await db.insert(userTypePermissions).values({
					userTypeId: typeRow.id,
					permissionId,
					granted: t.granted
				});
			}
		}
	}
}
