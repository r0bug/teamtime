import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import { renderTagSvgFromDimensions } from '$lib/server/services/tag-render-service';

const ctx = (extra: Record<string, unknown> = {}) =>
	({
		vendorDisplayName: 'Acme',
		settings: null,
		item: { partNumber: 'DVR1', name: 'Cup', description: null, priceCents: 999 },
		...extra
	}) as any;

describe('SVG preview — vertical edge date', () => {
	it('renders the date rotated down the edge on a tall label (>=0.8in)', async () => {
		const svg = await renderTagSvgFromDimensions(
			{ widthInches: 2.0, heightInches: 1.0, cssClass: 'x' } as any,
			ctx({ edgeDate: '06/25/2026', edgeDateSide: 'right' })
		);
		expect(svg).toContain('06/25/2026');
		expect(svg).toMatch(/rotate\(90/);
	});

	it('skips the date on a short label (<0.8in), matching the ZPL renderer', async () => {
		const svg = await renderTagSvgFromDimensions(
			{ widthInches: 2.0, heightInches: 0.6, cssClass: 'x' } as any,
			ctx({ edgeDate: '06/25/2026', edgeDateSide: 'right' })
		);
		expect(svg).not.toContain('06/25/2026');
	});

	it('does not render a date when no edgeDate is given', async () => {
		const svg = await renderTagSvgFromDimensions(
			{ widthInches: 2.0, heightInches: 1.0, cssClass: 'x' } as any,
			ctx()
		);
		expect(svg).not.toMatch(/rotate\(90/);
	});
});
