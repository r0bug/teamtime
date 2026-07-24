// Paint tools + diff accumulation. Pure — no DOM, no fetch.
//
// Tools produce (x,y,key,value) ops into a pending diff (last-write-wins per
// cell+key) that is optimistically applied to the local CellMap and POSTed as
// ONE batch on pointerup (spec §6: never per-cell writes during a drag).

import type { CellMap, CellOp } from './types';
import { cellKey } from './types';

export class PaintSession {
	/** pending ops, keyed "x,y,key" — last write wins */
	private pending = new Map<string, CellOp>();
	/** original values for rollback, first-touch wins */
	private snapshot = new Map<string, string | null>();

	constructor(
		private cells: CellMap,
		private gridW: number,
		private gridH: number
	) {}

	get size(): number {
		return this.pending.size;
	}

	ops(): CellOp[] {
		return [...this.pending.values()];
	}

	/** Stage one op: snapshot the original, apply optimistically, remember the diff. */
	apply(x: number, y: number, key: string, value: string | null): void {
		if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH || !Number.isInteger(x) || !Number.isInteger(y)) return;
		const ck = cellKey(x, y);
		const pk = `${ck},${key}`;
		const current = this.cells.get(ck)?.[key] ?? null;
		if (!this.snapshot.has(pk)) this.snapshot.set(pk, current);
		// No-op paints (same value) still stage nothing new but may cancel out.
		if (this.snapshot.get(pk) === value) {
			this.pending.delete(pk);
		} else {
			this.pending.set(pk, { x, y, key, value });
		}
		this.setLocal(ck, key, value);
	}

	/**
	 * Ops that would restore every touched cell to its pre-session value —
	 * capture BEFORE commit() to build an undo entry. Entries whose pending
	 * op cancelled out restore the current value; applying them later is a
	 * no-op, so they're safe to include.
	 */
	inverseOps(): CellOp[] {
		return [...this.snapshot.entries()].map(([pk, original]) => {
			const i2 = pk.lastIndexOf(',');
			const i1 = pk.lastIndexOf(',', i2 - 1);
			return {
				x: Number(pk.slice(0, i1)),
				y: Number(pk.slice(i1 + 1, i2)),
				key: pk.slice(i2 + 1),
				value: original
			};
		});
	}

	/** Undo all optimistic changes (failed save). */
	rollback(): void {
		for (const [pk, original] of this.snapshot) {
			const idx = pk.lastIndexOf(',');
			const ck = pk.slice(0, idx);
			const key = pk.slice(idx + 1);
			this.setLocal(ck, key, original);
		}
		this.pending.clear();
		this.snapshot.clear();
	}

	/** Forget the diff after a successful save (local state already matches). */
	commit(): void {
		this.pending.clear();
		this.snapshot.clear();
	}

	private setLocal(ck: string, key: string, value: string | null): void {
		const attrs = this.cells.get(ck);
		if (value === null) {
			if (attrs) {
				delete attrs[key];
				if (Object.keys(attrs).length === 0) this.cells.delete(ck);
			}
		} else if (attrs) {
			attrs[key] = value;
		} else {
			this.cells.set(ck, { [key]: value });
		}
	}
}

/** Rect tool: every cell in the drag box. */
export function rectCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
	const cells: { x: number; y: number }[] = [];
	for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
		for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
			cells.push({ x, y });
		}
	}
	return cells;
}

/** Wall tool: Bresenham line of cells between two points. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
	const cells: { x: number; y: number }[] = [];
	let x = x0,
		y = y0;
	const dx = Math.abs(x1 - x0),
		dy = -Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1,
		sy = y0 < y1 ? 1 : -1;
	let err = dx + dy;
	for (;;) {
		cells.push({ x, y });
		if (x === x1 && y === y1) break;
		const e2 = 2 * err;
		if (e2 >= dy) {
			err += dy;
			x += sx;
		}
		if (e2 <= dx) {
			err += dx;
			y += sy;
		}
	}
	return cells;
}

/**
 * Fill tool: flood over 4-connected cells sharing the clicked cell's current
 * value of `key` (undefined = flood over cells missing the key, bounded to
 * the grid — filling void is how Build mode extends the building, so cap it).
 */
export function floodCells(
	cells: CellMap,
	startX: number,
	startY: number,
	key: string,
	gridW: number,
	gridH: number,
	cap = 20000
): { x: number; y: number }[] {
	const target = cells.get(cellKey(startX, startY))?.[key];
	const out: { x: number; y: number }[] = [];
	const seen = new Set<string>();
	const queue: [number, number][] = [[startX, startY]];
	while (queue.length > 0 && out.length < cap) {
		const [x, y] = queue.pop()!;
		if (x < 0 || y < 0 || x >= gridW || y >= gridH) continue;
		const ck = cellKey(x, y);
		if (seen.has(ck)) continue;
		seen.add(ck);
		if (cells.get(ck)?.[key] !== target) continue;
		out.push({ x, y });
		queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
	}
	return out;
}
