import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, labelFormats: {} }));

import { route } from '../../../tools/label-designer/router';

const form = {
	code: 'x_15x1',
	name: 'X',
	layout: 'thermal',
	dpi: 203,
	widthIn: 1.5,
	heightIn: 1.0,
	mediaShape: 'rectangle',
	sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'W' }
};

describe('route', () => {
	it('previews a rectangle to SVG', async () => {
		const res = await route({ method: 'POST', path: '/api/preview', body: form });
		expect(res.status).toBe(200);
		expect(res.svg).toContain('<svg');
	});

	it('test-prints an alignment border to a stub printer', async () => {
		const sent: string[] = [];
		const res = await route(
			{ method: 'POST', path: '/api/test-print', body: { form, mode: 'border', printer: '1.2.3.4:9100' } },
			{ sendZpl: async (zpl) => { sent.push(zpl); } }
		);
		expect(res.status).toBe(200);
		expect(sent[0]).toContain('^GB305,203,2'); // border ZPL
	});

	it('saves via createFormat when code is new', async () => {
		const created: any[] = [];
		const res = await route(
			{ method: 'POST', path: '/api/save', body: form },
			{
				getFormatByCode: async () => null,
				createFormat: async (i: any) => { created.push(i); return { id: '1', ...i }; }
			}
		);
		expect(res.status).toBe(200);
		expect(created[0].code).toBe('x_15x1');
	});
});
