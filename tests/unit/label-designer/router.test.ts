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

	it('lists existing formats as loadable form states', async () => {
		const res = await route(
			{ method: 'GET', path: '/api/formats', body: undefined },
			{
				listFormats: async () => [
					{ code: 'zebra_2x1', name: 'Zebra 2x1', layout: 'thermal', labelWidthInches: '2.000', labelHeightInches: '1.000', dpi: 203, mediaShape: 'rectangle', shapeDimsJson: null } as any
				]
			}
		);
		expect(res.status).toBe(200);
		const json = res.json as { formats: { code: string; name: string; state: { widthIn: number } }[] };
		expect(json.formats[0].code).toBe('zebra_2x1');
		expect(json.formats[0].name).toBe('Zebra 2x1');
		expect(json.formats[0].state.widthIn).toBe(2); // mapped to a loadable FormState
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
