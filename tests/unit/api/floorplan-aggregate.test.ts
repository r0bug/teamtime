import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../../fixtures/api-helpers';

vi.mock('$lib/server/floorplan/core', () => ({
	getPlan: vi.fn(),
	getAttrDefs: vi.fn(),
	aggregate: vi.fn(),
	aggregateValue: vi.fn()
}));

import { GET } from '../../../src/routes/api/floorplan/[planId]/aggregate/+server';
import { getPlan, getAttrDefs, aggregate, aggregateValue } from '$lib/server/floorplan/core';

const PLAN = { id: 'p1', name: 'Yakima Finds', gridW: 140, gridH: 100 };
const DEFS = [
	{ planId: 'p1', key: 'vendor_id', type: 'categorical', ownerSystem: 'floorplan', visibility: 'public', renderHint: null },
	{ planId: 'p1', key: 'hunt_2026', type: 'enum', ownerSystem: 'teamtime', visibility: 'admin', renderHint: null }
];

async function status(fn: () => Promise<{ status: number }>): Promise<number> {
	try {
		return (await fn()).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	(getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(PLAN);
	(getAttrDefs as ReturnType<typeof vi.fn>).mockResolvedValue(DEFS);
});

describe('GET /api/floorplan/:planId/aggregate', () => {
	it('401 unauthenticated', async () => {
		expect(
			await status(() => callHandler(GET as never, { params: { planId: 'p1' }, url: 'http://x/a?key=vendor_id' }))
		).toBe(401);
	});

	it('400 without key', async () => {
		const res = await callHandlerAs(GET as never, 'staff', { params: { planId: 'p1' }, url: 'http://x/a' });
		expect(res.status).toBe(400);
	});

	it('403 aggregating an admin-visibility key as staff (no distribution leak)', async () => {
		expect(
			await status(() =>
				callHandlerAs(GET as never, 'staff', { params: { planId: 'p1' }, url: 'http://x/a?key=hunt_2026' })
			)
		).toBe(403);
	});

	it('200 per-value counts without value param', async () => {
		(aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ '17009': 62, '17042': 28 });
		const res = await callHandlerAs<Record<string, number>>(GET as never, 'staff', {
			params: { planId: 'p1' },
			url: 'http://x/a?key=vendor_id'
		});
		expect(res.status).toBe(200);
		expect(res.data).toEqual({ '17009': 62, '17042': 28 });
	});

	it('200 count+bbox+centroid with value param', async () => {
		(aggregateValue as ReturnType<typeof vi.fn>).mockResolvedValue({
			value: '17009',
			cells: 62,
			bbox: [10, 10, 20, 15],
			centroid: [15.2, 12.4]
		});
		const res = await callHandlerAs<{ cells: number; bbox: number[] }>(GET as never, 'staff', {
			params: { planId: 'p1' },
			url: 'http://x/a?key=vendor_id&value=17009'
		});
		expect(res.status).toBe(200);
		expect(res.data.cells).toBe(62);
		expect(res.data.bbox).toEqual([10, 10, 20, 15]);
		expect(aggregateValue).toHaveBeenCalledWith('p1', 'vendor_id', '17009');
	});
});
