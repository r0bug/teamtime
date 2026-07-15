/**
 * Geometry pins for the floorplan rasterizer. These encode surveyed reality
 * (scripts/data/yakima-finds-floorplan.json) — if one fails after an edit,
 * the edit changed the building, not the test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	cellsInRect,
	pointInPolygon,
	cellsInHalfEllipseEast,
	rasterizeSurvey,
	cellMapToRows,
	doorCells,
	type FloorplanSurvey
} from '../../../src/lib/server/floorplan/rasterize';

const survey = JSON.parse(
	readFileSync(resolve(__dirname, '../../../scripts/data/yakima-finds-floorplan.json'), 'utf8')
) as FloorplanSurvey;

const ALCOVE_CLIP: [number, number][] = [
	[6.5, 0],
	[6.5, 23.5],
	[0, 23.5],
	[0, 69],
	[104.5, 69],
	[104.5, 0]
];

describe('cellsInRect (center-in, half-open)', () => {
	it('x1=104.5 includes column 103, excludes 104', () => {
		const xs = new Set(cellsInRect(87, 0, 104.5, 1).map((c) => c.x));
		expect(xs.has(103)).toBe(true);
		expect(xs.has(104)).toBe(false);
		expect(xs.size).toBe(17.5 - 0.5); // 87..103
	});

	it('POS counter y0=44.5,y1=48.5 rasterizes rows 44..47', () => {
		const ys = new Set(cellsInRect(18, 44.5, 19, 48.5).map((c) => c.y));
		expect([...ys].sort((a, b) => a - b)).toEqual([44, 45, 46, 47]);
	});

	it('BLOCK_A x0=18.5 starts at column 18', () => {
		const xs = cellsInRect(18.5, 6, 32.5, 7).map((c) => c.x);
		expect(Math.min(...xs)).toBe(18);
		expect(Math.max(...xs)).toBe(31);
		expect(xs.length).toBe(14);
	});
});

describe('pointInPolygon (PNPOLY — do not "improve")', () => {
	it('front-door cell (6,8): center on the west edge counts as inside', () => {
		expect(pointInPolygon(6.5, 8.5, ALCOVE_CLIP)).toBe(true);
	});
	it('alcove cell (5,8) is outside (covered outdoor entry)', () => {
		expect(pointInPolygon(5.5, 8.5, ALCOVE_CLIP)).toBe(false);
	});
	it('cell (5,23) north of the jog is inside', () => {
		expect(pointInPolygon(5.5, 23.5, ALCOVE_CLIP)).toBe(true);
	});
});

describe('cellsInHalfEllipseEast (window bays)', () => {
	it('each bay rasterizes to ~102 cells (survey area 102 sqft)', () => {
		const bay = cellsInHalfEllipseEast([0, 34.29], 7, 18.58);
		expect(bay.length).toBe(102);
		// bulges east from the wall only (== avoids the -0 vs +0 Object.is trap)
		expect(Math.min(...bay.map((c) => c.x)) === 0).toBe(true);
		expect(Math.max(...bay.map((c) => c.x))).toBeLessThanOrEqual(6);
	});
});

describe('doorCells', () => {
	it('2ft front door on x=6.5 spanning y 8..10 → cells (6,8) and (6,9)', () => {
		const cells = doorCells({ id: 'FRONT_DOOR', type: 'door', from: [6.5, 8], to: [6.5, 10] });
		expect(cells).toEqual([
			{ x: 6, y: 8 },
			{ x: 6, y: 9 }
		]);
	});
});

describe('rasterizeSurvey (Yakima Finds, surveyed 2026-07-12)', () => {
	const cells = rasterizeSurvey(survey);

	function count(key: string): Record<string, number> {
		const out: Record<string, number> = {};
		for (const attrs of cells.values()) {
			const v = attrs[key];
			if (v !== undefined) out[v] = (out[v] ?? 0) + 1;
		}
		return out;
	}

	it('exact kind totals', () => {
		expect(count('kind')).toEqual({ sellable: 5799, structure: 848, boh: 391 });
	});

	it('exact zone totals (four zones)', () => {
		expect(count('zone')).toEqual({ main: 5361, storsly: 504, backroom: 782, ralph: 391 });
	});

	it('7038 painted cells / 15130 attr rows', () => {
		expect(cells.size).toBe(7038);
		expect(cellMapToRows(cells).length).toBe(15130);
	});

	it('exactly two door cells: (6,8) and (6,9)', () => {
		const doors = [...cells.entries()].filter(([, a]) => a.door === 'true').map(([k]) => k);
		expect(doors.sort()).toEqual(['6,8', '6,9']);
	});

	it('per-key merge: structures inside the main box keep zone:main', () => {
		expect(cells.get('20,10')).toMatchObject({ kind: 'structure', zone: 'main' });
	});

	it('window bays carry level:raised18 (staff-only key)', () => {
		const raised = [...cells.values()].filter((a) => a.level === 'raised18');
		expect(raised.length).toBe(204); // two 102-cell bays
	});

	it('archway cells (87, 40..45) are passable backroom floor', () => {
		for (let y = 40; y < 46; y++) {
			expect(cells.get(`87,${y}`)).toMatchObject({ kind: 'sellable', zone: 'backroom' });
		}
	});

	it('ralph is boh, not sellable (separate tenant, not YF booths)', () => {
		expect(cells.get('90,10')).toMatchObject({ kind: 'boh', zone: 'ralph' });
	});

	it('alcove is void — zero rows outside the clip', () => {
		expect(cells.has('5,8')).toBe(false);
		expect(cells.has('0,0')).toBe(false);
	});
});
