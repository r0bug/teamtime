// Floorplan core: plans, cells, attr defs, aggregates, count cache.
//
// DOMAIN-AGNOSTIC BY DESIGN. This module knows keys, values and cell counts —
// never vendors, rent, or sales. Vendor-aware validation lives in the API
// route; external data lives in ./connectors/. Keep it that way.

import { and, asc, eq, or, sql } from 'drizzle-orm';
import {
	db,
	floorplanPlans,
	floorplanCellAttrs,
	floorplanAttrDefs,
	floorplanCellCountCache,
	type FloorplanPlan,
	type FloorplanAttrDef
} from '$lib/server/db';

export interface CellOp {
	x: number;
	y: number;
	key: string;
	value: string | null; // null deletes the (x,y,key) row
}

export interface Cell {
	x: number;
	y: number;
	attrs: Record<string, string>;
}

const OP_CHUNK = 1000;

export async function listPlans(): Promise<FloorplanPlan[]> {
	return db.select().from(floorplanPlans).orderBy(asc(floorplanPlans.name));
}

export async function getPlan(planId: string): Promise<FloorplanPlan | undefined> {
	const [plan] = await db.select().from(floorplanPlans).where(eq(floorplanPlans.id, planId)).limit(1);
	return plan;
}

export async function growPlan(planId: string, gridW: number, gridH: number): Promise<FloorplanPlan | undefined> {
	const [updated] = await db
		.update(floorplanPlans)
		.set({ gridW, gridH, updatedAt: new Date() })
		.where(eq(floorplanPlans.id, planId))
		.returning();
	return updated;
}

export async function getCellAttrs(planId: string, x: number, y: number): Promise<Record<string, string>> {
	const rows = await db
		.select({ key: floorplanCellAttrs.key, value: floorplanCellAttrs.value })
		.from(floorplanCellAttrs)
		.where(and(eq(floorplanCellAttrs.planId, planId), eq(floorplanCellAttrs.x, x), eq(floorplanCellAttrs.y, y)));
	return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Cells matching ALL of the given key:value filters (empty filters = every
 * painted cell). Hydrates the full attr bag per matching cell.
 *
 * Implementation: filters resolve to matching coords via GROUP BY/HAVING on
 * the (plan,key,value) index; attrs hydrate from one full-plan read filtered
 * client-side. A whole plan is only ~15k rows — revisit if plans grow 100×.
 */
export async function queryCells(planId: string, filters: { key: string; value: string }[]): Promise<Cell[]> {
	let match: Set<string> | null = null;
	if (filters.length > 0) {
		const coordRows = await db
			.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y })
			.from(floorplanCellAttrs)
			.where(
				and(
					eq(floorplanCellAttrs.planId, planId),
					or(...filters.map((f) => and(eq(floorplanCellAttrs.key, f.key), eq(floorplanCellAttrs.value, f.value))))
				)
			)
			.groupBy(floorplanCellAttrs.x, floorplanCellAttrs.y)
			.having(sql`count(*) = ${filters.length}`);
		match = new Set(coordRows.map((r) => `${r.x},${r.y}`));
		if (match.size === 0) return [];
	}

	const rows = await db
		.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y, key: floorplanCellAttrs.key, value: floorplanCellAttrs.value })
		.from(floorplanCellAttrs)
		.where(eq(floorplanCellAttrs.planId, planId));

	const byCoord = new Map<string, Cell>();
	for (const row of rows) {
		const coord = `${row.x},${row.y}`;
		if (match && !match.has(coord)) continue;
		let cell = byCoord.get(coord);
		if (!cell) {
			cell = { x: row.x, y: row.y, attrs: {} };
			byCoord.set(coord, cell);
		}
		cell.attrs[row.key] = row.value;
	}
	return [...byCoord.values()];
}

/**
 * Batch upsert/delete in one transaction. value:null deletes the (x,y,key)
 * row; deleting every key at a cell returns it to void. Returns the set of
 * keys that were touched (drives the count-cache push).
 */
export async function applyOps(planId: string, ops: CellOp[]): Promise<Set<string>> {
	const upserts = ops.filter((op) => op.value !== null) as (CellOp & { value: string })[];
	const deletes = ops.filter((op) => op.value === null);

	await db.transaction(async (tx) => {
		for (let i = 0; i < upserts.length; i += OP_CHUNK) {
			const chunk = upserts.slice(i, i + OP_CHUNK);
			await tx
				.insert(floorplanCellAttrs)
				.values(chunk.map((op) => ({ planId, x: op.x, y: op.y, key: op.key, value: op.value })))
				.onConflictDoUpdate({
					target: [floorplanCellAttrs.planId, floorplanCellAttrs.x, floorplanCellAttrs.y, floorplanCellAttrs.key],
					set: { value: sql`excluded.value` }
				});
		}
		for (let i = 0; i < deletes.length; i += OP_CHUNK) {
			const chunk = deletes.slice(i, i + OP_CHUNK);
			await tx
				.delete(floorplanCellAttrs)
				.where(
					and(
						eq(floorplanCellAttrs.planId, planId),
						or(
							...chunk.map((op) =>
								and(eq(floorplanCellAttrs.x, op.x), eq(floorplanCellAttrs.y, op.y), eq(floorplanCellAttrs.key, op.key))
							)
						)
					)
				);
		}
	});

	return new Set(ops.map((op) => op.key));
}

/** Count of cells per distinct value of a key. THE spatial fact this module owns. */
export async function aggregate(planId: string, key: string): Promise<Record<string, number>> {
	const rows = await db
		.select({ value: floorplanCellAttrs.value, cells: sql<number>`count(*)::int` })
		.from(floorplanCellAttrs)
		.where(and(eq(floorplanCellAttrs.planId, planId), eq(floorplanCellAttrs.key, key)))
		.groupBy(floorplanCellAttrs.value);
	return Object.fromEntries(rows.map((r) => [r.value, r.cells]));
}

export interface ValueAggregate {
	value: string;
	cells: number;
	bbox: [number, number, number, number] | null;
	centroid: [number, number] | null;
}

export async function aggregateValue(planId: string, key: string, value: string): Promise<ValueAggregate> {
	const [row] = await db
		.select({
			cells: sql<number>`count(*)::int`,
			minX: sql<number | null>`min(${floorplanCellAttrs.x})`,
			minY: sql<number | null>`min(${floorplanCellAttrs.y})`,
			maxX: sql<number | null>`max(${floorplanCellAttrs.x})`,
			maxY: sql<number | null>`max(${floorplanCellAttrs.y})`,
			cx: sql<number | null>`avg(${floorplanCellAttrs.x})`,
			cy: sql<number | null>`avg(${floorplanCellAttrs.y})`
		})
		.from(floorplanCellAttrs)
		.where(
			and(eq(floorplanCellAttrs.planId, planId), eq(floorplanCellAttrs.key, key), eq(floorplanCellAttrs.value, value))
		);
	if (!row || row.cells === 0) return { value, cells: 0, bbox: null, centroid: null };
	return {
		value,
		cells: row.cells,
		bbox: [row.minX!, row.minY!, row.maxX!, row.maxY!],
		centroid: [Number(row.cx) + 0.5, Number(row.cy) + 0.5]
	};
}

/**
 * Refresh the derived count cache for one key: total-based and idempotent
 * (push for liveness; pull /aggregate for truth). Values that vanished from
 * the floor are removed.
 */
export async function recomputeCountCache(planId: string, key: string): Promise<void> {
	const counts = await aggregate(planId, key);
	await db.transaction(async (tx) => {
		await tx
			.delete(floorplanCellCountCache)
			.where(and(eq(floorplanCellCountCache.planId, planId), eq(floorplanCellCountCache.key, key)));
		const entries = Object.entries(counts);
		if (entries.length > 0) {
			await tx
				.insert(floorplanCellCountCache)
				.values(entries.map(([value, cells]) => ({ planId, key, value, cells, updatedAt: new Date() })));
		}
	});
}

export async function getCountCache(planId: string, key: string) {
	return db
		.select()
		.from(floorplanCellCountCache)
		.where(and(eq(floorplanCellCountCache.planId, planId), eq(floorplanCellCountCache.key, key)));
}

export async function getAttrDefs(planId: string): Promise<FloorplanAttrDef[]> {
	return db
		.select()
		.from(floorplanAttrDefs)
		.where(eq(floorplanAttrDefs.planId, planId))
		.orderBy(asc(floorplanAttrDefs.key));
}

export async function upsertAttrDef(
	planId: string,
	def: { key: string; type: string; ownerSystem?: string; visibility?: string; renderHint?: Record<string, unknown> | null }
): Promise<void> {
	await db
		.insert(floorplanAttrDefs)
		.values({
			planId,
			key: def.key,
			type: def.type,
			ownerSystem: def.ownerSystem ?? 'floorplan',
			visibility: def.visibility ?? 'public',
			renderHint: def.renderHint ?? null
		})
		.onConflictDoUpdate({
			target: [floorplanAttrDefs.planId, floorplanAttrDefs.key],
			set: {
				type: sql`excluded.type`,
				ownerSystem: sql`excluded.owner_system`,
				visibility: sql`excluded.visibility`,
				renderHint: sql`excluded.render_hint`,
				updatedAt: new Date()
			}
		});
}
