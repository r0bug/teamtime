/**
 * Vendor groups — many-to-many tags for reporting roll-ups.
 * No permissions are tied to groups; they're labels with a name + color.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	vendorGroups,
	vendorGroupMembers,
	type VendorGroup
} from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor-group');

export interface VendorGroupWithCount extends VendorGroup {
	memberCount: number;
}

export async function listGroups(opts?: { includeArchived?: boolean }): Promise<VendorGroupWithCount[]> {
	const conditions = [];
	if (!opts?.includeArchived) conditions.push(sql`${vendorGroups.archivedAt} IS NULL`);

	const groups = await db
		.select()
		.from(vendorGroups)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(asc(vendorGroups.displayOrder), asc(vendorGroups.name));

	if (groups.length === 0) return [];

	const counts = await db
		.select({
			groupId: vendorGroupMembers.groupId,
			count: sql<number>`count(*)::int`
		})
		.from(vendorGroupMembers)
		.groupBy(vendorGroupMembers.groupId);
	const countByGroup = new Map(counts.map((c) => [c.groupId, c.count]));

	return groups.map((g) => ({ ...g, memberCount: countByGroup.get(g.id) ?? 0 }));
}

export async function getGroup(id: string): Promise<VendorGroup | null> {
	const [row] = await db.select().from(vendorGroups).where(eq(vendorGroups.id, id)).limit(1);
	return row ?? null;
}

export async function createGroup(input: {
	name: string;
	color?: string;
	displayOrder?: number;
	createdByUserId?: string;
}): Promise<VendorGroup> {
	const [row] = await db
		.insert(vendorGroups)
		.values({
			name: input.name.trim(),
			color: input.color ?? '#6B7280',
			displayOrder: input.displayOrder ?? 0,
			createdByUserId: input.createdByUserId ?? null
		})
		.returning();
	log.info({ groupId: row.id, name: row.name }, 'Created vendor group');
	return row;
}

export async function updateGroup(
	id: string,
	patch: { name?: string; color?: string; displayOrder?: number }
): Promise<VendorGroup> {
	const set: Record<string, unknown> = {};
	if (patch.name !== undefined) set.name = patch.name.trim();
	if (patch.color !== undefined) set.color = patch.color;
	if (patch.displayOrder !== undefined) set.displayOrder = patch.displayOrder;
	if (Object.keys(set).length === 0) {
		const existing = await getGroup(id);
		if (!existing) throw new Error(`Group not found: ${id}`);
		return existing;
	}
	const [row] = await db
		.update(vendorGroups)
		.set(set)
		.where(eq(vendorGroups.id, id))
		.returning();
	if (!row) throw new Error(`Group not found: ${id}`);
	return row;
}

export async function archiveGroup(id: string): Promise<void> {
	await db
		.update(vendorGroups)
		.set({ archivedAt: new Date() })
		.where(eq(vendorGroups.id, id));
	log.info({ groupId: id }, 'Archived vendor group');
}
