// Pure rasterization of the floorplan survey file (schema 1.0: envelope +
// zones + fixed structures → 1 ft² cell attrs). No DB access — shared by the
// seed script and unit tests.
//
// Geometry rules (pinned by tests — do not "improve"):
// - A cell (x,y) covers [x,x+1) × [y,y+1); its center is (x+0.5, y+0.5).
// - A cell is inside a rect/polygon/ellipse iff its CENTER is inside
//   (half-open for rects). So an edge at x=104.5 includes column 103 only.
// - Point-in-polygon is the PNPOLY even-odd ray cast. Points exactly on a
//   west/south edge count as inside via the opposite-edge crossing; this is
//   what keeps the front-door cells (6,8)/(6,9) inside the alcove notch.

export interface SurveyZone {
	id: string;
	name: string;
	rentable: boolean;
	polygon?: [number, number][];
	notes?: string;
}

export interface SurveyStructure {
	id: string;
	name: string;
	rentable: boolean;
	polygon?: [number, number][];
	type?: string; // 'raised_platform' for the window bays
	raised_in?: number;
	projection_ft?: number;
	width_ft?: number;
	center?: [number, number];
}

export interface SurveyOpening {
	id: string;
	type: 'door' | 'archway';
	from: [number, number];
	to: [number, number];
	width?: number;
	notes?: string;
}

export interface FloorplanSurvey {
	site: { name: string; address?: string; surveyed?: string };
	envelope: { polygon: [number, number][] };
	zones: SurveyZone[];
	fixed_structures: SurveyStructure[];
	openings?: SurveyOpening[];
	booths?: unknown[];
}

/** Attribute bags keyed by "x,y". */
export type CellMap = Map<string, Record<string, string>>;

export function cellKey(x: number, y: number): string {
	return `${x},${y}`;
}

/** Integer cells whose center falls in the half-open rect [x0,x1)×[y0,y1). */
export function cellsInRect(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
	const cells: { x: number; y: number }[] = [];
	// Smallest integer x with x+0.5 >= x0 is ceil(x0 - 0.5).
	const startX = Math.ceil(x0 - 0.5);
	const startY = Math.ceil(y0 - 0.5);
	for (let x = startX; x + 0.5 < x1; x++) {
		for (let y = startY; y + 0.5 < y1; y++) {
			cells.push({ x, y });
		}
	}
	return cells;
}

/** PNPOLY even-odd ray cast. */
export function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

/** Integer cells whose center lies inside a polygon (bbox scan + PNPOLY). */
export function cellsInPolygon(poly: [number, number][]): { x: number; y: number }[] {
	const xs = poly.map((p) => p[0]);
	const ys = poly.map((p) => p[1]);
	const cells: { x: number; y: number }[] = [];
	for (const { x, y } of cellsInRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
		if (pointInPolygon(x + 0.5, y + 0.5, poly)) cells.push({ x, y });
	}
	return cells;
}

/**
 * Integer cells inside a half-ellipse bulging EAST from a point on the front
 * (west) wall: semi-axis `projection` along +x, `width/2` along y.
 * Used for the two raised window-display bays.
 */
export function cellsInHalfEllipseEast(
	center: [number, number],
	projection: number,
	width: number
): { x: number; y: number }[] {
	const [cx, cy] = center;
	const b = width / 2;
	const cells: { x: number; y: number }[] = [];
	for (const { x, y } of cellsInRect(cx, cy - b, cx + projection, cy + b)) {
		const dx = (x + 0.5 - cx) / projection;
		const dy = (y + 0.5 - cy) / b;
		if (x + 0.5 >= cx && dx * dx + dy * dy <= 1) cells.push({ x, y });
	}
	return cells;
}

// Survey ids → the zone values the app queries on.
const ZONE_SLUGS: Record<string, string> = {
	MAIN: 'main',
	STORSLY: 'storsly',
	BACKRM: 'backroom',
	RALPH: 'ralph'
};

function paint(cells: CellMap, at: { x: number; y: number }[], attrs: Record<string, string>): void {
	for (const { x, y } of at) {
		const key = cellKey(x, y);
		const existing = cells.get(key) ?? {};
		// Per-key merge: painting one key never erases others on the cell.
		Object.assign(existing, attrs);
		cells.set(key, existing);
	}
}

/**
 * Rasterize the survey into a CellMap:
 * 1. envelope → kind:sellable, zone:main (the L-shaped open floor)
 * 2. named zones override: rentable → sellable, else boh
 * 3. fixed structures override: kind:structure (+level for raised bays)
 * 4. openings: door cells just inside the wall; archway cells forced passable
 */
export function rasterizeSurvey(survey: FloorplanSurvey): CellMap {
	const cells: CellMap = new Map();

	paint(cells, cellsInPolygon(survey.envelope.polygon), { kind: 'sellable', zone: 'main' });

	for (const zone of survey.zones) {
		if (!zone.polygon) continue; // MAIN has no polygon — it's the remainder
		const slug = ZONE_SLUGS[zone.id] ?? zone.id.toLowerCase();
		paint(cells, cellsInPolygon(zone.polygon), {
			kind: zone.rentable ? 'sellable' : 'boh',
			zone: slug
		});
	}

	for (const s of survey.fixed_structures) {
		const attrs: Record<string, string> = { kind: 'structure', label: s.name };
		if (s.raised_in) attrs.level = `raised${s.raised_in}`;
		if (s.polygon) {
			paint(cells, cellsInPolygon(s.polygon), attrs);
		} else if (s.center && s.projection_ft && s.width_ft) {
			paint(cells, cellsInHalfEllipseEast(s.center, s.projection_ft, s.width_ft), attrs);
		}
	}

	for (const opening of survey.openings ?? []) {
		if (opening.type === 'door') {
			paint(cells, doorCells(opening), { door: 'true' });
		} else if (opening.type === 'archway') {
			// A gap in the wall: these cells must be passable, not structure.
			for (const { x, y } of doorCells(opening)) {
				const existing = cells.get(cellKey(x, y));
				if (existing && existing.kind === 'structure') {
					existing.kind = 'sellable';
					delete existing.label;
				}
			}
		}
	}

	return cells;
}

/**
 * Cells just INSIDE a door/arch segment lying on a wall. A vertical segment
 * at x=6.5 spanning y 8→10 yields cells (6,8) and (6,9): the interior is the
 * cell column containing the wall line.
 */
export function doorCells(opening: SurveyOpening): { x: number; y: number }[] {
	const [x0, y0] = opening.from;
	const [x1, y1] = opening.to;
	const cells: { x: number; y: number }[] = [];
	if (x0 === x1) {
		const x = Math.floor(x0);
		for (const { y } of cellsInRect(0, Math.min(y0, y1), 1, Math.max(y0, y1))) {
			cells.push({ x, y });
		}
	} else {
		const y = Math.floor(y0);
		for (const { x } of cellsInRect(Math.min(x0, x1), 0, Math.max(x0, x1), 1)) {
			cells.push({ x, y });
		}
	}
	return cells;
}

/** Flatten a CellMap into insertable (x, y, key, value) rows. */
export function cellMapToRows(cells: CellMap): { x: number; y: number; key: string; value: string }[] {
	const rows: { x: number; y: number; key: string; value: string }[] = [];
	for (const [coord, attrs] of cells) {
		const [x, y] = coord.split(',').map(Number);
		for (const [key, value] of Object.entries(attrs)) {
			rows.push({ x, y, key, value });
		}
	}
	return rows;
}
