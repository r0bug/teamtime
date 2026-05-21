import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		insert: () => ({
			values: (v: any) => ({
				returning: () => mockInsert(v)
			})
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve([])
				})
			})
		})
	},
	labelFormats: { id: 'id', code: 'code' }
}));

import { createFormat } from '$lib/server/services/label-format-service';

describe('label-format-service createFormat catalog-sync fields', () => {
	beforeEach(() => { mockInsert.mockReset(); });

	it('createFormat persists catalog-sync fields', async () => {
		mockInsert.mockResolvedValue([{ id: 'f1' }]);
		await createFormat({
			code: 'zt1', name: 'Zebra Thermal 1', layout: 'thermal',
			labelWidthInches: 2, labelHeightInches: 1,
			category: 'thermal', manufacturer: 'zebra', mediaShape: 'rectangle',
			mediaSensor: 'gap', partNumber: '10010044', dpi: 203
		} as any);
		const vals = mockInsert.mock.calls[0][0];
		expect(vals.category).toBe('thermal');
		expect(vals.manufacturer).toBe('zebra');
		expect(vals.dpi).toBe(203);
		expect(vals.mediaSensor).toBe('gap');
		expect(vals.mediaShape).toBe('rectangle');
		expect(vals.partNumber).toBe('10010044');
	});

	it('createFormat applies defaults when catalog-sync fields are omitted', async () => {
		mockInsert.mockResolvedValue([{ id: 'f2' }]);
		await createFormat({
			code: 'sh1', name: 'Sheet 1', layout: 'sheet',
			labelWidthInches: 2, labelHeightInches: 1,
			pageWidthInches: 8.5, pageHeightInches: 11,
			cols: 3, rows: 10
		} as any);
		const vals = mockInsert.mock.calls[0][0];
		// category defaults to layout value
		expect(vals.category).toBe('sheet');
		// mediaShape defaults to 'rectangle'
		expect(vals.mediaShape).toBe('rectangle');
		// manufacturer defaults to 'custom'
		expect(vals.manufacturer).toBe('custom');
		// nullable fields default to null
		expect(vals.mediaSensor).toBeNull();
		expect(vals.dpi).toBeNull();
		expect(vals.partNumber).toBeNull();
		expect(vals.shapeDimsJson).toBeNull();
	});
});
