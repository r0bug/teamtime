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
 * Deterministic value → HSL, so a vendor keeps its color across sessions.
 * Hue advances by the golden angle per step so CONSECUTIVE inputs land far
 * apart on the wheel — NRS vendor IDs are sequential (19803, 19804, …) and a
 * plain hash gave neighbors near-identical hues. Lightness cycles three
 * tiers as a second separator for hue near-collisions.
 * MUST stay legacy comma syntax: canvas fillStyle in older Chrome rejects
 * space-separated hsl() silently, which paints cells in the last-used color
 * (the background) — i.e. invisibly.
 */
export function autoColor(value: string): string {
	let n: number;
	if (/^\d+$/.test(value)) {
		n = parseInt(value, 10);
	} else {
		// FNV-1a for non-numeric values
		n = 0x811c9dc5;
		for (let i = 0; i < value.length; i++) n = ((n ^ value.charCodeAt(i)) * 0x01000193) >>> 0;
	}
	const hue = Math.round((n * 137.508) % 360);
	const light = 42 + (n % 3) * 8; // 42 / 50 / 58%
	return `hsl(${hue}, 65%, ${light}%)`;
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
