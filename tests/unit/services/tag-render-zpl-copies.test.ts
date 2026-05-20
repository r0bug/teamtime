import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve([])
				})
			})
		})
	},
	labelFormats: {}
}));

import { renderZpl } from '$lib/server/services/tag-render-service';

const baseCtx = {
	vendorDisplayName: 'Sample Vendor',
	settings: null,
	item: { partNumber: 'SR51626001', name: 'Pyrex bowl', description: 'Vintage', priceCents: 2499 }
} as any;

describe('renderZpl ^PQ behavior', () => {
	it('defaults to ^PQ1 when copies not provided', async () => {
		const zpl = await renderZpl(baseCtx);
		expect(zpl).toContain('^PQ1');
	});

	it('emits ^PQ<n> when copies set', async () => {
		const zpl = await renderZpl({ ...baseCtx, copies: 4 });
		expect(zpl).toContain('^PQ4');
		expect(zpl).not.toContain('^PQ1\n');
	});

	it('clamps copies to [1, 99]', async () => {
		expect(await renderZpl({ ...baseCtx, copies: 0 })).toContain('^PQ1');
		expect(await renderZpl({ ...baseCtx, copies: -7 })).toContain('^PQ1');
		expect(await renderZpl({ ...baseCtx, copies: 9999 })).toContain('^PQ99');
	});

	it('floors fractional copies', async () => {
		expect(await renderZpl({ ...baseCtx, copies: 3.7 })).toContain('^PQ3');
	});
});
