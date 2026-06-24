import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import { renderZplFromDimensions } from '$lib/server/services/tag-render-service';

const ctx = {
	vendorDisplayName: 'Acme LLC',
	settings: null,
	item: { partNumber: 'SR1', name: null, description: 'x', priceCents: 100 }
} as any;
const dims = { widthInches: 2, heightInches: 1, cssClass: 'x' };

describe('header override (label name source)', () => {
	it('uses headerOverride over vendorDisplayName when set', () => {
		const zpl = renderZplFromDimensions(dims as any, { ...ctx, headerOverride: "Bob's Treasures" });
		expect(zpl).toContain("^FDBob's Treasures");
	});

	it('falls back to vendorDisplayName when override is blank', () => {
		const zpl = renderZplFromDimensions(dims as any, { ...ctx, headerOverride: '  ' });
		expect(zpl).toContain('^FDAcme LLC');
	});
});
