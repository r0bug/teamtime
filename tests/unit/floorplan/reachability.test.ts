import { describe, it, expect } from 'vitest';
import { checkReachability } from '../../../src/lib/floorplan/reachability';
import type { CellMap } from '../../../src/lib/floorplan/types';

function plan(rows: string[]): CellMap {
	// s=sellable, S=sellable+door, w=structure, b=boh, .=void
	const cells: CellMap = new Map();
	rows.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			if (ch === '.') return;
			const attrs: Record<string, string> =
				ch === 'w' ? { kind: 'structure' } : ch === 'b' ? { kind: 'boh' } : { kind: 'sellable' };
			if (ch === 'S') attrs.door = 'true';
			cells.set(`${x},${y}`, attrs);
		});
	});
	return cells;
}

describe('checkReachability', () => {
	it('open floor: everything reachable from the door', () => {
		const r = checkReachability(plan(['Ssss', 'ssss']));
		expect(r.doors).toBe(1);
		expect(r.unreachable.size).toBe(0);
	});

	it('walled-off island is flagged', () => {
		const r = checkReachability(plan(['Ssw s'.replace(' ', 's'), 'ssws']));
		// column of structure at x=2 splits x=3 cells from the door
		expect(r.unreachable.has('3,0')).toBe(true);
		expect(r.unreachable.has('3,1')).toBe(true);
		expect(r.unreachable.has('1,0')).toBe(false);
	});

	it('boh is not traversed and not flagged (Ralph expected separate)', () => {
		const r = checkReachability(plan(['Sbs']));
		// sellable at x=2 only connects through boh — unreachable
		expect(r.unreachable.has('2,0')).toBe(true);
		expect(r.unreachable.has('1,0')).toBe(false); // boh never flagged
	});

	it('no doors: every sellable cell is unreachable', () => {
		const r = checkReachability(plan(['sss']));
		expect(r.doors).toBe(0);
		expect(r.unreachable.size).toBe(3);
	});

	it('void does not connect (diagonals/gaps block)', () => {
		const r = checkReachability(plan(['S.s']));
		expect(r.unreachable.has('2,0')).toBe(true);
	});
});
