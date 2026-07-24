import { describe, it, expect } from 'vitest';
import { PaintSession, rectCells, lineCells, floodCells } from '../../../src/lib/floorplan/paint';
import type { CellMap } from '../../../src/lib/floorplan/types';

function cellsOf(entries: [string, Record<string, string>][]): CellMap {
	return new Map(entries.map(([k, v]) => [k, { ...v }]));
}

describe('PaintSession', () => {
	it('accumulates last-write-wins ops and applies optimistically', () => {
		const cells = cellsOf([['1,1', { kind: 'sellable' }]]);
		const s = new PaintSession(cells, 10, 10);
		s.apply(1, 1, 'vendor_id', '17009');
		s.apply(1, 1, 'vendor_id', '17042'); // overwrites the pending op
		expect(s.ops()).toEqual([{ x: 1, y: 1, key: 'vendor_id', value: '17042' }]);
		expect(cells.get('1,1')!.vendor_id).toBe('17042');
	});

	it('painting back the original value cancels the op', () => {
		const cells = cellsOf([['1,1', { kind: 'sellable', vendor_id: '17009' }]]);
		const s = new PaintSession(cells, 10, 10);
		s.apply(1, 1, 'vendor_id', '17042');
		s.apply(1, 1, 'vendor_id', '17009');
		expect(s.size).toBe(0);
	});

	it('null deletes; deleting the last key voids the cell locally', () => {
		const cells = cellsOf([['2,2', { vendor_id: '17009' }]]);
		const s = new PaintSession(cells, 10, 10);
		s.apply(2, 2, 'vendor_id', null);
		expect(cells.has('2,2')).toBe(false);
		expect(s.ops()).toEqual([{ x: 2, y: 2, key: 'vendor_id', value: null }]);
	});

	it('rollback restores every touched cell', () => {
		const cells = cellsOf([['1,1', { kind: 'sellable', vendor_id: '17009' }]]);
		const s = new PaintSession(cells, 10, 10);
		s.apply(1, 1, 'vendor_id', '17042');
		s.apply(3, 3, 'vendor_id', '17042'); // was void
		s.rollback();
		expect(cells.get('1,1')!.vendor_id).toBe('17009');
		expect(cells.has('3,3')).toBe(false);
		expect(s.size).toBe(0);
	});

	it('ignores out-of-grid coords', () => {
		const s = new PaintSession(new Map(), 5, 5);
		s.apply(-1, 0, 'kind', 'sellable');
		s.apply(5, 0, 'kind', 'sellable');
		expect(s.size).toBe(0);
	});

	it('inverseOps restores pre-session values when replayed (undo)', () => {
		const cells = cellsOf([['1,1', { kind: 'sellable', vendor_id: '17009' }]]);
		const s = new PaintSession(cells, 10, 10);
		s.apply(1, 1, 'vendor_id', '17042'); // overwrite
		s.apply(3, 3, 'vendor_id', '17042'); // was void
		const inverse = s.inverseOps();
		s.commit();

		const u = new PaintSession(cells, 10, 10);
		for (const op of inverse) u.apply(op.x, op.y, op.key, op.value);
		expect(cells.get('1,1')!.vendor_id).toBe('17009');
		expect(cells.has('3,3')).toBe(false);
		// the undo session's ops are exactly what a save would POST
		expect(u.ops()).toEqual(
			expect.arrayContaining([
				{ x: 1, y: 1, key: 'vendor_id', value: '17009' },
				{ x: 3, y: 3, key: 'vendor_id', value: null }
			])
		);
	});
});

describe('tools', () => {
	it('rectCells covers the drag box regardless of direction', () => {
		expect(rectCells(2, 3, 0, 1).length).toBe(9);
	});

	it('lineCells draws a contiguous Bresenham line', () => {
		const line = lineCells(0, 0, 4, 2);
		expect(line[0]).toEqual({ x: 0, y: 0 });
		expect(line[line.length - 1]).toEqual({ x: 4, y: 2 });
		// contiguous: each step moves at most 1 in each axis
		for (let i = 1; i < line.length; i++) {
			expect(Math.abs(line[i].x - line[i - 1].x)).toBeLessThanOrEqual(1);
			expect(Math.abs(line[i].y - line[i - 1].y)).toBeLessThanOrEqual(1);
		}
	});

	it('floodCells fills the contiguous same-value region only', () => {
		// 3x1 sellable strip, then a structure, then more sellable
		const cells = cellsOf([
			['0,0', { kind: 'sellable' }],
			['1,0', { kind: 'sellable' }],
			['2,0', { kind: 'structure' }],
			['3,0', { kind: 'sellable' }]
		]);
		const filled = floodCells(cells, 0, 0, 'kind', 10, 10);
		const keys = new Set(filled.map((c) => `${c.x},${c.y}`));
		expect(keys.has('1,0')).toBe(true);
		expect(keys.has('2,0')).toBe(false);
		expect(keys.has('3,0')).toBe(false);
	});

	it('flood over void is bounded by the grid, not infinite', () => {
		const filled = floodCells(new Map(), 0, 0, 'kind', 20, 20);
		expect(filled.length).toBe(400);
	});
});
