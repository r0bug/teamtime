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

describe('renderZplFromDimensions', () => {
	it('renders ZPL from explicit dimensions without a DB lookup', () => {
		const dims = { widthInches: 2.0, heightInches: 1.0, cssClass: 'x' };
		const zpl = renderZplFromDimensions(dims, ctx);
		expect(zpl.startsWith('^XA')).toBe(true);
		expect(zpl).toContain('^PW406'); // 2.0 * 203
		expect(zpl).toContain('^LL203'); // 1.0 * 203
	});

	it('honors barbell dims (two-pad path)', () => {
		const dims = {
			widthInches: 2.125,
			heightInches: 0.6125,
			cssClass: 'x',
			mediaShape: 'barbell',
			shapeDims: {
				pads: [
					{ role: 'barcode', xIn: 0, widthIn: 0.85 },
					{ role: 'info', xIn: 1.275, widthIn: 0.85 }
				]
			}
		};
		const zpl = renderZplFromDimensions(dims as any, ctx);
		const origins = [...zpl.matchAll(/^\^FO(\d+),/gm)].map((m) => parseInt(m[1], 10));
		expect(origins.some((x) => x >= Math.round(1.275 * 203))).toBe(true); // info pad on the right
	});
});
