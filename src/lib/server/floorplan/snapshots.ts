// Layout snapshots: freeze and restore the full cell-attr state of a plan.
// Domain-agnostic like core.ts — rows in, rows out, no vendor/rent knowledge.
// Restore replaces the plan's cells wholesale inside one transaction, after
// capturing an 'auto' backup of the current state so a restore can itself be
// reverted. Snapshots capture layout only (cell attrs) — attr defs, pools and
// connectors are plan config and stay untouched.

import { and, desc, eq, inArray } from 'drizzle-orm';
import {
	db,
	floorplanCellAttrs,
	floorplanPlans,
	floorplanSnapshots,
	type FloorplanSnapshot
} from '$lib/server/db';

export interface SnapshotRow {
	x: number;
	y: number;
	key: string;
	value: string;
}

/** Snapshot metadata for list views — everything but the cell blob. */
export type SnapshotMeta = Omit<FloorplanSnapshot, 'cells'>;

const ROW_CHUNK = 1000;
const AUTO_KEEP = 10; // pre-restore backups retained per plan

/** drizzle 0.29 + postgres-js may return jsonb as a JSON string. */
function snapshotRows(snapshot: FloorplanSnapshot): SnapshotRow[] {
	const raw = snapshot.cells as unknown;
	if (Array.isArray(raw)) return raw as SnapshotRow[];
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as SnapshotRow[]) : [];
		} catch {
			return [];
		}
	}
	return [];
}

export async function listSnapshots(planId: string): Promise<SnapshotMeta[]> {
	return db
		.select({
			id: floorplanSnapshots.id,
			planId: floorplanSnapshots.planId,
			name: floorplanSnapshots.name,
			kind: floorplanSnapshots.kind,
			attrRows: floorplanSnapshots.attrRows,
			createdBy: floorplanSnapshots.createdBy,
			createdAt: floorplanSnapshots.createdAt
		})
		.from(floorplanSnapshots)
		.where(eq(floorplanSnapshots.planId, planId))
		.orderBy(desc(floorplanSnapshots.createdAt));
}

export async function createSnapshot(
	planId: string,
	name: string,
	userId: string | null,
	kind: 'manual' | 'auto' = 'manual'
): Promise<SnapshotMeta> {
	const rows = await db
		.select({
			x: floorplanCellAttrs.x,
			y: floorplanCellAttrs.y,
			key: floorplanCellAttrs.key,
			value: floorplanCellAttrs.value
		})
		.from(floorplanCellAttrs)
		.where(eq(floorplanCellAttrs.planId, planId));

	const [saved] = await db
		.insert(floorplanSnapshots)
		.values({ planId, name, kind, cells: rows, attrRows: rows.length, createdBy: userId })
		.returning();
	if (kind === 'auto') await pruneAutoSnapshots(planId);
	const { cells: _cells, ...meta } = saved;
	return meta;
}

/**
 * Replace the plan's entire cell state with a snapshot's. Captures an 'auto'
 * backup of the current state first (same transaction), so restoring is never
 * a one-way door. Returns the touched key set (union of before/after — drives
 * the count-cache push, mirroring applyOps) or null if the snapshot doesn't
 * exist on this plan.
 */
export async function restoreSnapshot(
	planId: string,
	snapshotId: string,
	userId: string | null
): Promise<{ restored: number; backupId: string; changedKeys: Set<string> } | null> {
	const [snapshot] = await db
		.select()
		.from(floorplanSnapshots)
		.where(and(eq(floorplanSnapshots.planId, planId), eq(floorplanSnapshots.id, snapshotId)))
		.limit(1);
	if (!snapshot) return null;
	const rows = snapshotRows(snapshot);

	let backupId = '';
	const changedKeys = new Set<string>(rows.map((r) => r.key));

	await db.transaction(async (tx) => {
		const current = await tx
			.select({
				x: floorplanCellAttrs.x,
				y: floorplanCellAttrs.y,
				key: floorplanCellAttrs.key,
				value: floorplanCellAttrs.value
			})
			.from(floorplanCellAttrs)
			.where(eq(floorplanCellAttrs.planId, planId));
		for (const row of current) changedKeys.add(row.key);

		const [backup] = await tx
			.insert(floorplanSnapshots)
			.values({
				planId,
				name: `Before restore of "${snapshot.name}"`,
				kind: 'auto',
				cells: current,
				attrRows: current.length,
				createdBy: userId
			})
			.returning({ id: floorplanSnapshots.id });
		backupId = backup.id;

		await tx.delete(floorplanCellAttrs).where(eq(floorplanCellAttrs.planId, planId));
		for (let i = 0; i < rows.length; i += ROW_CHUNK) {
			const chunk = rows.slice(i, i + ROW_CHUNK);
			await tx
				.insert(floorplanCellAttrs)
				.values(chunk.map((r) => ({ planId, x: r.x, y: r.y, key: r.key, value: r.value })));
		}

		await tx
			.update(floorplanPlans)
			.set({ updatedAt: new Date() })
			.where(eq(floorplanPlans.id, planId));
	});

	await pruneAutoSnapshots(planId);
	return { restored: rows.length, backupId, changedKeys };
}

export async function deleteSnapshot(planId: string, snapshotId: string): Promise<boolean> {
	const deleted = await db
		.delete(floorplanSnapshots)
		.where(and(eq(floorplanSnapshots.planId, planId), eq(floorplanSnapshots.id, snapshotId)))
		.returning({ id: floorplanSnapshots.id });
	return deleted.length > 0;
}

/** Keep only the newest AUTO_KEEP pre-restore backups; manual saves are never pruned. */
async function pruneAutoSnapshots(planId: string): Promise<void> {
	const autos = await db
		.select({ id: floorplanSnapshots.id })
		.from(floorplanSnapshots)
		.where(and(eq(floorplanSnapshots.planId, planId), eq(floorplanSnapshots.kind, 'auto')))
		.orderBy(desc(floorplanSnapshots.createdAt));
	const stale = autos.slice(AUTO_KEEP).map((r) => r.id);
	if (stale.length > 0) {
		await db.delete(floorplanSnapshots).where(inArray(floorplanSnapshots.id, stale));
	}
}
