import { describe, it, expect } from 'vitest';
import { zoomAt, pan, screenToCell, worldToScreen, fitToContent, contentBBox } from '../../../src/lib/floorplan/camera';
import type { CellMap } from '../../../src/lib/floorplan/types';

const cam = { offsetX: 0, offsetY: 100, scale: 10 };

describe('camera math', () => {
	it('world/screen round-trips with the y flip (north up)', () => {
		const { sx, sy } = worldToScreen(cam, 5, 90);
		expect(screenToCell(cam, sx + 1, sy - 1)).toEqual({ x: 5, y: 90 });
	});

	it('zoomAt keeps the world point under the cursor fixed', () => {
		const before = screenToCell(cam, 200, 150);
		const zoomed = zoomAt(cam, 200, 150, 2);
		const after = screenToCell(zoomed, 200, 150);
		expect(after).toEqual(before);
		expect(zoomed.scale).toBe(20);
	});

	it('pan shifts by screen pixels', () => {
		const p = pan(cam, 50, -30);
		expect(p.offsetX).toBe(-5);
		expect(p.offsetY).toBe(97);
	});

	it('fitToContent frames painted cells only, ignoring void extent', () => {
		const cells: CellMap = new Map([
			['10,10', { kind: 'sellable' }],
			['19,19', { kind: 'sellable' }]
		]);
		expect(contentBBox(cells)).toEqual({ minX: 10, minY: 10, maxX: 20, maxY: 20 });
		const fitted = fitToContent(cells, 500, 500, 50);
		// content spans 10 world units → scale fills 400px → 40 px/ft
		expect(fitted.scale).toBe(40);
		const tl = worldToScreen(fitted, 10, 20);
		expect(tl.sx).toBeCloseTo(50, 5);
		expect(tl.sy).toBeCloseTo(50, 5);
	});
});
