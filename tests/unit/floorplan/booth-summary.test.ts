import { describe, it, expect, vi } from 'vitest';

// booth-summary reaches for the db handle at module load; the pure builders
// under test never touch it.
vi.mock('$lib/server/db', () => ({ db: {}, floorplanPlans: {}, floorplanCellAttrs: {}, floorplanPools: {} }));

import { buildBoothSummaries, formatBoothMeta } from '$lib/server/floorplan/booth-summary';

const plan = { id: 'p1', name: 'Yakima Finds' };
const row = (x: number, y: number, key: string, value: string, planId = 'p1') => ({ planId, x, y, key, value });

describe('buildBoothSummaries', () => {
	it('derives size, bbox, zones and levels per vendor from cells', () => {
		const rows = [
			row(10, 20, 'vendor_id', '17009'), row(11, 20, 'vendor_id', '17009'), row(10, 21, 'vendor_id', '17009'),
			row(10, 20, 'zone', 'main'), row(11, 20, 'zone', 'main'), row(10, 21, 'zone', 'ralph'),
			row(10, 21, 'level', 'raised18'),
			row(50, 50, 'vendor_id', '17011'), row(50, 50, 'zone', 'main')
		];
		const out = buildBoothSummaries([plan], rows, []);
		const sr = out.get('17009')!;
		expect(sr.cells).toBe(3);
		expect(sr.plans).toHaveLength(1);
		expect(sr.plans[0].bbox).toEqual([10, 20, 11, 21]);
		expect(sr.plans[0].zones).toEqual([{ zone: 'main', cells: 2 }, { zone: 'ralph', cells: 1 }]);
		expect(sr.plans[0].levels).toEqual(['raised18']);
		expect(out.get('17011')!.cells).toBe(1);
	});

	it('records pool membership even for vendors with no cells', () => {
		const out = buildBoothSummaries([plan], [], [{ name: 'Jewelry Case', vendorIds: ['17009', '99'] }, { name: 'Art Wall', vendorIds: ['17009'] }]);
		expect(out.get('17009')!.pools).toEqual(['Art Wall', 'Jewelry Case']);
		expect(out.get('17009')!.cells).toBe(0);
		expect(out.get('99')!.pools).toEqual(['Jewelry Case']);
	});

	it('keeps plans separate when a vendor spans two plans', () => {
		const p2 = { id: 'p2', name: 'Annex' };
		const out = buildBoothSummaries([plan, p2], [row(1, 1, 'vendor_id', '5'), row(2, 2, 'vendor_id', '5', 'p2')], []);
		expect(out.get('5')!.cells).toBe(2);
		expect(out.get('5')!.plans.map((p) => p.planName)).toEqual(['Yakima Finds', 'Annex']);
	});
});

describe('formatBoothMeta', () => {
	it('renders blank values for a vendor not on the floorplan', () => {
		expect(formatBoothMeta(undefined, { boothNumber: 'A1' })).toEqual({ meta72: '', meta73: '', meta74: false });
		expect(formatBoothMeta({ nrsVendorId: '1', cells: 0, plans: [], pools: [] }, { boothNumber: null }).meta74).toBe(false);
	});

	it('renders booth details and size/location for a painted vendor', () => {
		const summary = buildBoothSummaries(
			[plan],
			[row(10, 20, 'vendor_id', '17009'), row(11, 20, 'vendor_id', '17009'), row(10, 20, 'zone', 'main'), row(11, 20, 'zone', 'main')],
			[{ name: 'Jewelry Case', vendorIds: ['17009'] }]
		).get('17009');
		const m = formatBoothMeta(summary, { boothNumber: '12' });
		expect(m.meta74).toBe(true);
		expect(m.meta72).toContain('Booth #12 | 2 sq ft | Zone: Main | Pools: Jewelry Case');
		expect(m.meta72).toContain('Managed by TeamTime floorplan');
		expect(m.meta73).toBe('2 sq ft, 2 ft x 1 ft footprint, grid (10,20)-(11,20), zone Main, plan "Yakima Finds"; Shared pool space: Jewelry Case');
	});

	it('flags pool-only vendors as on the floorplan', () => {
		const m = formatBoothMeta({ nrsVendorId: '7', cells: 0, plans: [], pools: ['Art Wall'] }, { boothNumber: null });
		expect(m.meta74).toBe(true);
		expect(m.meta72).toContain('No booth cells (pool space only)');
		expect(m.meta73).toBe('Shared pool space: Art Wall');
	});
});
