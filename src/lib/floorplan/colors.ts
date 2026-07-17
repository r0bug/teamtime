// Cell coloring: attr palettes from render hints, deterministic 'auto'
// palette for open-ended keys (vendor_id), kind-color fallback.

import type { AttrDef } from './types';

export const KIND_FALLBACK: Record<string, string> = {
	sellable: '#1C2630',
	structure: '#3A4550',
	boh: '#2C2640',
	circ: '#20323C'
};

export const VOID_BG = '#0d1117';
export const UNKNOWN_VALUE_COLOR = '#555f6a';

/**
 * Deterministic hash → HSL, so a vendor keeps its color across sessions.
 * MUST stay legacy comma syntax: canvas fillStyle in older Chrome rejects
 * space-separated hsl() silently, which paints cells in the last-used color
 * (the background) — i.e. invisibly.
 */
export function autoColor(value: string): string {
	let h = 0;
	for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
	return `hsl(${h % 360}, 60%, 48%)`;
}

/** Color for a cell under the selected overlay key (null = not painted for that key). */
export function cellColor(attrs: Record<string, string>, overlayKey: string, def: AttrDef | undefined): string | null {
	const value = attrs[overlayKey];
	if (value === undefined) {
		// Fall back to kind so the building stays visible under any overlay.
		return attrs.kind ? (KIND_FALLBACK[attrs.kind] ?? UNKNOWN_VALUE_COLOR) : null;
	}
	const palette = def?.renderHint?.palette;
	if (palette === 'auto') return autoColor(value);
	if (palette && typeof palette === 'object' && palette[value]) return palette[value];
	return autoColor(value);
}
