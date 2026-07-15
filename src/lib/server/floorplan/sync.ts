// Floorplan sync — FLAG, NEVER REPAIR (spec §5).
//
// Reconciles painted vendor_id cells against the vendors mirror and reports
// deltas as staff notifications. It never mutates cells or vendors: tolerant
// code hides bugs, and floor data must never be destroyed by a sync hiccup.
// (Vendor identity itself is auto-mirrored by the pre-existing syncFromNrs();
// this job only watches the floorplan-relevant intersection.)

import { and, eq, inArray, isNull, not, or, sql } from 'drizzle-orm';
import { db, users, vendors, notifications, floorplanPlans, floorplanCellAttrs } from '$lib/server/db';
import { createLogger } from '$lib/server/logger';

const log = createLogger('floorplan:sync');

export interface FloorplanSyncFlag {
	planId: string;
	planName: string;
	check: 'unknown_vendor' | 'inactive_vendor' | 'unplaced_vendor';
	title: string;
	body: string;
	vendorIds: string[];
}

/** Compute the three delta checks for every plan. Pure read. */
export async function computeSyncFlags(): Promise<FloorplanSyncFlag[]> {
	const flags: FloorplanSyncFlag[] = [];
	const plans = await db.select().from(floorplanPlans);

	for (const plan of plans) {
		const painted = await db
			.select({ value: floorplanCellAttrs.value, cells: sql<number>`count(*)::int` })
			.from(floorplanCellAttrs)
			.where(and(eq(floorplanCellAttrs.planId, plan.id), eq(floorplanCellAttrs.key, 'vendor_id')))
			.groupBy(floorplanCellAttrs.value);

		const paintedIds = painted.map((p) => p.value);
		const numericIds = paintedIds.filter((v) => /^\d+$/.test(v)).map(Number);
		const known = numericIds.length
			? await db
					.select({
						nrsVendorId: vendors.nrsVendorId,
						displayName: vendors.displayName,
						status: vendors.status,
						nrsInactive: vendors.nrsInactive
					})
					.from(vendors)
					.where(inArray(vendors.nrsVendorId, numericIds))
			: [];
		const knownById = new Map(known.map((v) => [String(v.nrsVendorId), v]));

		// 1. Painted on the floor, no vendor record — reconcile (never unassign).
		const unknown = painted.filter((p) => !knownById.has(p.value));
		if (unknown.length > 0) {
			flags.push({
				planId: plan.id,
				planName: plan.name,
				check: 'unknown_vendor',
				title: 'Floorplan: cells assigned to unknown vendors',
				body: unknown
					.map((p) => `Vendor "${p.value}" has ${p.cells} cell(s) on "${plan.name}" but no vendor record — reconcile.`)
					.join('\n'),
				vendorIds: unknown.map((p) => p.value)
			});
		}

		// 2. Painted but inactive/terminated in NRS — drift, do not pick a winner.
		const inactive = painted.filter((p) => {
			const v = knownById.get(p.value);
			return v && (v.nrsInactive || v.status === 'terminated');
		});
		if (inactive.length > 0) {
			flags.push({
				planId: plan.id,
				planName: plan.name,
				check: 'inactive_vendor',
				title: 'Floorplan: inactive vendors still occupy floor space',
				body: inactive
					.map((p) => {
						const v = knownById.get(p.value)!;
						return `${v.displayName} (${p.value}) is ${v.nrsInactive ? 'inactive in NRS' : v.status} but occupies ${p.cells} cell(s) on "${plan.name}".`;
					})
					.join('\n'),
				vendorIds: inactive.map((p) => p.value)
			});
		}

		// 3. Active vendors with no floor space — informational digest.
		const paintedSet = new Set(paintedIds);
		const unplaced = await db
			.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName })
			.from(vendors)
			.where(and(eq(vendors.status, 'active'), eq(vendors.nrsInactive, false), not(isNull(vendors.nrsVendorId))));
		const missing = unplaced.filter((v) => !paintedSet.has(String(v.nrsVendorId)));
		if (missing.length > 0) {
			flags.push({
				planId: plan.id,
				planName: plan.name,
				check: 'unplaced_vendor',
				title: `Floorplan: ${missing.length} active vendor(s) have no floor space`,
				body: missing.map((v) => `${v.displayName} (${v.nrsVendorId})`).join(', ') + ` — none assigned on "${plan.name}".`,
				vendorIds: missing.map((v) => String(v.nrsVendorId))
			});
		}
	}
	return flags;
}

/**
 * Emit flags as notifications to every admin + manager, deduplicated: a flag
 * is skipped while an UNREAD notification with the same (planId, check)
 * fingerprint exists for that user. Returns counts for the cron response.
 */
export async function runFloorplanSync(): Promise<{ flags: number; notified: number; skipped: number }> {
	const flags = await computeSyncFlags();
	if (flags.length === 0) return { flags: 0, notified: 0, skipped: 0 };

	const recipients = await db
		.select({ id: users.id })
		.from(users)
		.where(and(or(eq(users.role, 'admin'), eq(users.role, 'manager')), eq(users.isActive, true)));

	// Fingerprints of unread floorplan_sync notifications. The check runs in
	// JS because drizzle 0.29 + postgres-js double-encodes jsonb inserts
	// (stored as a JSON string), so @>-containment can't be trusted here.
	const unread = await db
		.select({ userId: notifications.userId, data: notifications.data })
		.from(notifications)
		.where(and(eq(notifications.type, 'floorplan_sync'), eq(notifications.isRead, false)));
	const seen = new Set<string>();
	for (const row of unread) {
		const data = typeof row.data === 'string' ? safeParse(row.data) : row.data;
		if (data && typeof data === 'object') {
			seen.add(`${row.userId}:${(data as Record<string, unknown>).planId}:${(data as Record<string, unknown>).check}`);
		}
	}

	let notified = 0;
	let skipped = 0;
	for (const flag of flags) {
		for (const { id: userId } of recipients) {
			if (seen.has(`${userId}:${flag.planId}:${flag.check}`)) {
				skipped++;
				continue;
			}
			await db.insert(notifications).values({
				userId,
				type: 'floorplan_sync',
				title: flag.title,
				body: flag.body,
				data: { planId: flag.planId, check: flag.check, vendorIds: flag.vendorIds }
			});
			notified++;
		}
	}
	log.info({ flags: flags.length, notified, skipped }, 'Floorplan sync completed');
	return { flags: flags.length, notified, skipped };
}

function safeParse(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
