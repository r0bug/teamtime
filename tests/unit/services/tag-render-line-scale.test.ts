import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import { renderZplFromDimensions } from '$lib/server/services/tag-render-service';

const ctx = {
	vendorDisplayName: 'Acme',
	settings: null,
	item: { partNumber: 'SR51626001', name: null, description: 'Widget', priceCents: 999 }
} as any;

/** Font height of the line whose ^FD payload matches `marker` (nearest
 *  preceding ^A0N,<h>). */
function fontOf(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	const hit = lines.findIndex((l) => marker.test(l));
	for (let j = hit; j >= 0; j--) {
		const m = lines[j].match(/^\^A0N,(\d+),/);
		if (m) return parseInt(m[1], 10);
	}
	return -1;
}

const dims = (lineScales?: Record<string, number>) => ({
	widthInches: 2.0,
	heightInches: 1.0,
	cssClass: 'x',
	mediaShape: 'rectangle',
	shapeDims: lineScales ? { lineScales } : null
});

describe('renderZplFromDimensions per-line font scale', () => {
	it('scales the price line when lineScales.price is set', () => {
		const base = fontOf(renderZplFromDimensions(dims() as any, ctx), /\^FD\$9\.99/);
		const scaled = fontOf(renderZplFromDimensions(dims({ price: 2 }) as any, ctx), /\^FD\$9\.99/);
		expect(base).toBeGreaterThan(0);
		expect(scaled).toBe(base * 2);
	});

	it('scales the vendor-name header independently', () => {
		const base = fontOf(renderZplFromDimensions(dims() as any, ctx), /\^FDAcme/);
		const scaled = fontOf(renderZplFromDimensions(dims({ header: 1.5 }) as any, ctx), /\^FDAcme/);
		expect(scaled).toBe(Math.round(base * 1.5));
	});

	it('scales the barcode row height', () => {
		const base = renderZplFromDimensions(dims() as any, ctx).match(/\^BCN,(\d+),/);
		const scaled = renderZplFromDimensions(dims({ barcode: 1.5 }) as any, ctx).match(/\^BCN,(\d+),/);
		expect(base && scaled).toBeTruthy();
		expect(parseInt(scaled![1], 10)).toBe(Math.round(parseInt(base![1], 10) * 1.5));
	});

	it('leaves output unchanged when no lineScales set', () => {
		const a = renderZplFromDimensions(dims() as any, ctx);
		const b = renderZplFromDimensions(dims(undefined) as any, ctx);
		expect(a).toBe(b);
	});
});
