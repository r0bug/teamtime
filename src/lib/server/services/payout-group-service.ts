// NRS pass-through payout groups.
//
// NRS joins vendors for payment: a CHILD vendor's sales go on its PARENT's
// check ("Associated Pass-Through Vendors" on the NRS vendor view page,
// mirrored into vendors.parent_nrs_vendor_id on every sync). NRS is the
// source of truth; TeamTime only reads it.
//
// TeamTime shows the payout unit, today: a child never appears on its own
// anywhere — pickers, leaderboards, sales tables, the floorplan, the vendor
// directory — only as a sub-section under its parent. Sales roll up to the
// parent at each member's OWN rate (LCA 13% + YFLC 25% both land on LCA).
// Child portals are disabled; the parent's portal acts for every member.

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, vendors, type Vendor } from '$lib/server/db';

export interface PayoutGroupMaps {
	/** child NRS id → parent NRS id */
	parentOf: Map<number, number>;
	/** parent NRS id → child NRS ids */
	childrenOf: Map<number, number[]>;
	childIds: Set<number>;
	/** display name / code for every member, keyed by NRS id */
	names: Map<number, { displayName: string; code: string | null }>;
}

export async function loadPayoutGroups(): Promise<PayoutGroupMaps> {
	const rows = await db
		.select({ nrsVendorId: vendors.nrsVendorId, parentNrsVendorId: vendors.parentNrsVendorId, displayName: vendors.displayName, code: vendors.inventoryCodePrefix })
		.from(vendors)
		.where(sql`${vendors.nrsVendorId} IS NOT NULL`);
	const parentOf = new Map<number, number>();
	const childrenOf = new Map<number, number[]>();
	const names = new Map<number, { displayName: string; code: string | null }>();
	for (const r of rows) names.set(r.nrsVendorId!, { displayName: r.displayName, code: r.code });
	for (const r of rows) {
		if (r.parentNrsVendorId === null || r.parentNrsVendorId === r.nrsVendorId) continue;
		// A parent that is itself a child collapses to the top of its chain.
		let top = r.parentNrsVendorId;
		const seen = new Set<number>();
		while (true) {
			const next = rows.find((x) => x.nrsVendorId === top)?.parentNrsVendorId ?? null;
			if (next === null || next === top || seen.has(next)) break;
			seen.add(next);
			top = next;
		}
		parentOf.set(r.nrsVendorId!, top);
		childrenOf.set(top, [...(childrenOf.get(top) ?? []), r.nrsVendorId!]);
	}
	return { parentOf, childrenOf, childIds: new Set(parentOf.keys()), names };
}

/** The payout vendor for an NRS id: its parent when it is a child, else itself. */
export function rollupNrsId(maps: Pick<PayoutGroupMaps, 'parentOf'>, nrsId: number): number {
	return maps.parentOf.get(nrsId) ?? nrsId;
}

/** Parent + children NRS ids, parent first. */
export function groupMemberIds(maps: Pick<PayoutGroupMaps, 'childrenOf'>, parentNrsId: number): number[] {
	return [parentNrsId, ...(maps.childrenOf.get(parentNrsId) ?? [])];
}

/** NRS snapshot vendor row shape (sales_snapshots.vendors[]). */
export interface SnapshotVendorLike {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

/**
 * Merge children into their parents within one day's snapshot list. Amounts
 * add (each member keeps its own split, so retained stays exact); the parent's
 * TeamTime name wins. Parents with no sales of their own are created so a
 * child's day still shows under the parent.
 */
export function rollupSnapshotVendors<T extends SnapshotVendorLike>(dayVendors: T[], maps: PayoutGroupMaps): T[] {
	if (maps.childIds.size === 0) return dayVendors;
	const out = new Map<string, T>();
	for (const v of dayVendors) {
		const id = parseInt(v.vendor_id, 10);
		const target = Number.isFinite(id) ? rollupNrsId(maps, id) : id;
		const key = Number.isFinite(id) ? String(target) : v.vendor_id;
		const cur = out.get(key);
		if (!cur) {
			const name = Number.isFinite(id) && target !== id ? maps.names.get(target)?.displayName ?? v.vendor_name : v.vendor_name;
			out.set(key, { ...v, vendor_id: key, vendor_name: name });
		} else {
			cur.total_sales = round2((cur.total_sales ?? 0) + (v.total_sales ?? 0));
			cur.vendor_amount = round2((cur.vendor_amount ?? 0) + (v.vendor_amount ?? 0));
			cur.retained_amount = round2((cur.retained_amount ?? 0) + (v.retained_amount ?? 0));
			if (target !== id && maps.names.get(target)) cur.vendor_name = maps.names.get(target)!.displayName;
		}
	}
	return [...out.values()];
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// ── Portal context ─────────────────────────────────────────────────────────

export interface PortalContext {
	/** The login's primary vendor: a parent (or standalone) account. */
	vendor: Vendor;
	/** Every vendor this login may act for: primaries first, then their NRS children. */
	members: Vendor[];
}

/**
 * Which vendor accounts a portal login can act for. Children (NRS parent set)
 * never qualify as a login's own vendor — their portal is dead — but they are
 * members of their parent's context. Among a user's own accounts the one with
 * the highest payout % leads (same rule getVendorForUser has always used).
 */
export async function getPortalContext(userId: string): Promise<PortalContext | null> {
	const own = await db
		.select()
		.from(vendors)
		.where(and(eq(vendors.userId, userId), eq(vendors.portalEnabled, true), isNull(vendors.parentNrsVendorId)))
		.orderBy(desc(vendors.vendorPaymentPercent), asc(vendors.displayName), asc(vendors.id));
	if (own.length === 0) return null;
	const parentIds = own.map((v) => v.nrsVendorId).filter((n): n is number => n !== null);
	const children = parentIds.length
		? await db.select().from(vendors).where(inArray(vendors.parentNrsVendorId, parentIds)).orderBy(asc(vendors.displayName))
		: [];
	const members: Vendor[] = [...own];
	for (const c of children) if (!members.some((m) => m.id === c.id)) members.push(c);
	return { vendor: own[0], members };
}

/**
 * Resolve the vendor a portal request acts on: `requestedVendorId` (a
 * vendors.id) when it is a member of the login's context, else the primary.
 * Returns null when the login has no portal access at all.
 */
export async function resolvePortalVendor(
	userId: string,
	requestedVendorId: string | null | undefined
): Promise<{ vendor: Vendor; selected: Vendor; members: Vendor[] } | null> {
	const ctx = await getPortalContext(userId);
	if (!ctx) return null;
	const selected = (requestedVendorId && ctx.members.find((m) => m.id === requestedVendorId)) || ctx.vendor;
	return { vendor: ctx.vendor, selected, members: ctx.members };
}
