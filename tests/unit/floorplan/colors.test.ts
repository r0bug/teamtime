/**
 * @module Tests/Unit/Floorplan/Colors
 * @description Auto-palette distinctness and cellColor precedence.
 */
import { describe, it, expect } from 'vitest';
import { autoColor, cellColor, KIND_FALLBACK } from '$lib/floorplan/colors';
import type { AttrDef } from '$lib/floorplan/types';

function hue(color: string): number {
	const m = color.match(/^hsl\((\d+),/);
	if (!m) throw new Error(`not legacy-comma hsl: ${color}`);
	return Number(m[1]);
}

function hueDist(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return Math.min(d, 360 - d);
}

describe('autoColor', () => {
	it('is deterministic', () => {
		expect(autoColor('19803')).toBe(autoColor('19803'));
		expect(autoColor('Shared Case 1')).toBe(autoColor('Shared Case 1'));
	});

	it('uses legacy comma hsl() syntax (older Chrome canvas requirement)', () => {
		expect(autoColor('19803')).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
		expect(autoColor('west wall')).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
	});

	it('gives consecutive numeric vendor IDs well-separated hues', () => {
		// NRS vendor IDs are sequential; adjacent booths must not blend.
		const ids = Array.from({ length: 12 }, (_, i) => String(19800 + i));
		const hues = ids.map((id) => hue(autoColor(id)));
		for (let i = 1; i < hues.length; i++) {
			expect(hueDist(hues[i - 1], hues[i])).toBeGreaterThan(60);
		}
	});

	it('differs for consecutive IDs even as full colors', () => {
		expect(autoColor('19803')).not.toBe(autoColor('19804'));
		expect(autoColor('19804')).not.toBe(autoColor('19805'));
	});
});

describe('cellColor', () => {
	const def = (palette: Record<string, string> | 'auto'): AttrDef => ({
		key: 'vendor_id',
		type: 'string',
		ownerSystem: 'nrs',
		visibility: 'all',
		renderHint: { palette }
	});

	it('prefers an explicit palette entry over the auto color', () => {
		expect(cellColor({ vendor_id: '19803' }, 'vendor_id', def({ '19803': '#123456' }))).toBe('#123456');
	});

	it('falls back to autoColor when the palette lacks the value', () => {
		expect(cellColor({ vendor_id: '19803' }, 'vendor_id', def({ '19999': '#123456' }))).toBe(autoColor('19803'));
	});

	it('falls back to the kind color when the overlay key is absent', () => {
		expect(cellColor({ kind: 'sellable' }, 'vendor_id', undefined)).toBe(KIND_FALLBACK.sellable);
	});
});
