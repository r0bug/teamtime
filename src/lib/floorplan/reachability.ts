// Build-mode integrity check (spec §6): flood from door cells across
// passable kinds; any sellable cell not reached is flagged. Warn, don't
// block — this catches the island/hole class of geometry error.

import type { CellMap } from './types';
import { cellKey, parseKey } from './types';

const PASSABLE = new Set(['sellable', 'circ']);

export interface ReachabilityResult {
	doors: number;
	sellable: number;
	unreachable: Set<string>; // "x,y" of sellable cells no door reaches
}

export function checkReachability(cells: CellMap): ReachabilityResult {
	const doors: string[] = [];
	let sellable = 0;
	for (const [key, attrs] of cells) {
		if (attrs.door === 'true') doors.push(key);
		if (attrs.kind === 'sellable') sellable++;
	}

	const reached = new Set<string>();
	const queue = [...doors];
	while (queue.length > 0) {
		const ck = queue.pop()!;
		if (reached.has(ck)) continue;
		const attrs = cells.get(ck);
		if (!attrs || !PASSABLE.has(attrs.kind)) continue;
		reached.add(ck);
		const { x, y } = parseKey(ck);
		queue.push(cellKey(x + 1, y), cellKey(x - 1, y), cellKey(x, y + 1), cellKey(x, y - 1));
	}

	const unreachable = new Set<string>();
	for (const [key, attrs] of cells) {
		if (attrs.kind === 'sellable' && !reached.has(key)) unreachable.add(key);
	}
	return { doors: doors.length, sellable, unreachable };
}
