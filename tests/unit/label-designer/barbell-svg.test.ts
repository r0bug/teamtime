import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, labelFormats: {} }));
import { renderBarbellPreviewSvg } from '../../../tools/label-designer/barbell-svg';

const f = {
	widthIn: 2.125,
	heightIn: 0.6125,
	mediaShape: 'barbell',
	pads: [
		{ role: 'barcode', xIn: 0, widthIn: 0.85 },
		{ role: 'info', xIn: 1.275, widthIn: 0.85 }
	],
	sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'Widget' }
} as any;

describe('renderBarbellPreviewSvg', () => {
	it('draws two pad rects and places the price text in the info pad region', async () => {
		const svg = await renderBarbellPreviewSvg(f);
		expect(svg).toContain('<svg');
		expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(3); // outline + 2 pads
		expect(svg).toContain('$9.99');
	});
});
