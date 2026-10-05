import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, vendors: {}, salesSnapshots: {}, floorplanPlans: {}, floorplanCellAttrs: {}, floorplanPools: {} }));
import { recentMonths, buildBooths, buildReport } from '$lib/server/floorplan/revenue-trends';

const cell = (x: number, y: number, key: string, value: string) => ({ x, y, key, value });

describe('recentMonths', () => {
	it('lists complete months oldest first, ending with last month', () => {
		expect(recentMonths(3, new Date('2026-10-05T12:00:00Z'))).toEqual(['2026-07', '2026-08', '2026-09']);
		expect(recentMonths(2, new Date('2026-01-15T12:00:00Z'))).toEqual(['2025-11', '2025-12']);
	});
});

describe('buildBooths', () => {
	const vendorsIn = [
		{ nrsVendorId: 17160, displayName: 'Christina McCarthy', code: 'ROSIE', monthlyRentCents: null },
		{ nrsVendorId: 17159, displayName: 'Tami Swartz', code: 'BMC', monthlyRentCents: 25000 },
		{ nrsVendorId: 17009, displayName: "Storlie's Relics", code: 'SR', monthlyRentCents: null }
	];
	const cells = [cell(1, 1, 'vendor_id', '17160'), cell(2, 1, 'vendor_id', '17160'), cell(5, 5, 'pool', 'McCarthy / Swartz'), cell(9, 9, 'vendor_id', '17009')];

	it('merges pool members into one shared booth with combined cells and rent', () => {
		const booths = buildBooths(vendorsIn, cells, [{ name: 'McCarthy / Swartz', vendorIds: ['17160', '17159'] }]);
		const shared = booths.find((b) => b.key === 'p:McCarthy / Swartz')!;
		expect(shared.shared).toBe(true);
		expect(shared.label).toBe('ROSIE + BMC');
		expect(shared.sqft).toBe(3);
		expect(shared.rent).toBe(250);
		expect(shared.vendorIds).toEqual([17160, 17159]);
		const sr = booths.find((b) => b.key === 'v:17009')!;
		expect(sr.shared).toBe(false);
		expect(sr.sqft).toBe(1);
		expect(booths.some((b) => b.key === 'v:17160')).toBe(false);
	});

	it('accepts jsonb-as-string pool members', () => {
		const booths = buildBooths(vendorsIn, cells, [{ name: 'McCarthy / Swartz', vendorIds: '["17160","17159"]' }]);
		expect(booths.find((b) => b.shared)?.vendorIds).toEqual([17160, 17159]);
	});
});

describe('buildReport', () => {
	const booth = { key: 'p:x', label: 'ROSIE + BMC', names: [], vendorIds: [17160, 17159], shared: true, sqft: 100, rent: 250 };
	const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
	const retained = new Map<number, Map<string, number>>([
		[17160, new Map(months.map((m, i) => [m, 50 + i * 10]))],
		[17159, new Map(months.map((m) => [m, 100]))]
	]);

	it('combines occupants, adds rent, divides by sq ft, and computes trend', () => {
		const r = buildReport([booth], months, retained);
		const row = r.rows[0];
		// Sep: (50+5*10) + 100 + 250 rent = 450 / 100 sq ft
		expect(row.months[5].storeRevenue).toBe(450);
		expect(row.lastPerSqft).toBe(4.5);
		expect(row.totalStoreRevenue).toBe(400 + 410 + 420 + 430 + 440 + 450);
		// recent 3 avg = (4.3+4.4+4.5)/3 = 4.4; prior 3 = (4.0+4.1+4.2)/3 = 4.1 → +7.32%
		expect(row.trendPct).toBeCloseTo(7.32, 1);
		expect(r.storeSeries[5]).toEqual({ month: '2026-09', storeRevenue: 450, sqft: 100, perSqft: 4.5 });
		expect(r.totalSqft).toBe(100);
	});

	it('yields null per sq ft and trend when a booth has no cells or too few months', () => {
		const r = buildReport([{ ...booth, sqft: 0 }], months.slice(-2), retained);
		expect(r.rows[0].lastPerSqft).toBeNull();
		expect(r.rows[0].trendPct).toBeNull();
		expect(r.storeSeries[0].perSqft).toBeNull();
	});
});
