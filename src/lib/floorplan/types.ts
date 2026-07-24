// Shared client-side floorplan types. Pure — no DOM, no stores.

export interface PlanInfo {
	id: string;
	name: string;
	gridW: number;
	gridH: number;
}

export interface AttrDef {
	key: string;
	type: string;
	ownerSystem: string;
	visibility: string;
	renderHint: { mode?: string; palette?: Record<string, string> | 'auto'; from?: string; to?: string } | null;
}

/** Attribute bags keyed by "x,y" — the client's working copy of the plan. */
export type CellMap = Map<string, Record<string, string>>;

export interface CellOp {
	x: number;
	y: number;
	key: string;
	value: string | null;
}

export type Mode = 'view' | 'edit' | 'build';
export type Tool = 'cell' | 'rect' | 'fill' | 'wall' | 'pick';

export function cellKey(x: number, y: number): string {
	return `${x},${y}`;
}

export function parseKey(key: string): { x: number; y: number } {
	const [x, y] = key.split(',').map(Number);
	return { x, y };
}
