// Viewport camera: zoom + pan + fit-to-content. Pure math, no DOM.
//
// World space = feet (1 unit per cell); screen space = CSS pixels.
// screen = (world - offset) * scale

import type { CellMap } from './types';
import { parseKey } from './types';

export interface Camera {
	offsetX: number; // world coord at the viewport's left edge
	offsetY: number; // world coord at the viewport's TOP edge (y flipped: north up)
	scale: number; // px per foot
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 80;

/**
 * +y is NORTH in world space but screens grow downward, so the y axis flips:
 * a cell's top-left on screen is (x, y+1) in world space.
 */
export function worldToScreen(cam: Camera, wx: number, wy: number): { sx: number; sy: number } {
	return { sx: (wx - cam.offsetX) * cam.scale, sy: (cam.offsetY - wy) * cam.scale };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): { wx: number; wy: number } {
	return { wx: cam.offsetX + sx / cam.scale, wy: cam.offsetY - sy / cam.scale };
}

export function screenToCell(cam: Camera, sx: number, sy: number): { x: number; y: number } {
	const { wx, wy } = screenToWorld(cam, sx, sy);
	return { x: Math.floor(wx), y: Math.floor(wy) };
}

/** Zoom anchored at a screen point (the world point under the cursor stays put). */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
	if (scale === cam.scale) return cam;
	const { wx, wy } = screenToWorld(cam, sx, sy);
	return { scale, offsetX: wx - sx / scale, offsetY: wy + sy / scale };
}

export function pan(cam: Camera, dxPx: number, dyPx: number): Camera {
	return { ...cam, offsetX: cam.offsetX - dxPx / cam.scale, offsetY: cam.offsetY + dyPx / cam.scale };
}

/** Bounding box of PAINTED cells only — void never drives framing. */
export function contentBBox(cells: CellMap): { minX: number; minY: number; maxX: number; maxY: number } | null {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const key of cells.keys()) {
		const { x, y } = parseKey(key);
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return minX === Infinity ? null : { minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

/** Frame the painted content in a viewport with a margin (a large sparse grid opens tight). */
export function fitToContent(cells: CellMap, viewportW: number, viewportH: number, marginPx = 40): Camera {
	const bbox = contentBBox(cells);
	if (!bbox || viewportW <= 0 || viewportH <= 0) return { offsetX: 0, offsetY: 100, scale: 8 };
	const w = bbox.maxX - bbox.minX;
	const h = bbox.maxY - bbox.minY;
	const scale = Math.min(
		MAX_SCALE,
		Math.max(MIN_SCALE, Math.min((viewportW - 2 * marginPx) / w, (viewportH - 2 * marginPx) / h))
	);
	return {
		scale,
		offsetX: bbox.minX - (viewportW / scale - w) / 2,
		offsetY: bbox.maxY + (viewportH / scale - h) / 2
	};
}
