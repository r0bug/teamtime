import { describe, it, expect } from 'vitest';
import { previousMonthRange } from '$lib/server/floorplan/revenue';

describe('previousMonthRange', () => {
	it('returns the full previous calendar month (Pacific)', () => {
		// 2026-10-05 noon UTC = Oct 5 Pacific
		const r = previousMonthRange(new Date('2026-10-05T12:00:00Z'));
		expect(r).toEqual({ start: '2026-09-01', end: '2026-09-30', label: 'Sep 2026' });
	});

	it('rolls back across a year boundary', () => {
		const r = previousMonthRange(new Date('2026-01-15T12:00:00Z'));
		expect(r).toEqual({ start: '2025-12-01', end: '2025-12-31', label: 'Dec 2025' });
	});

	it('handles February length', () => {
		const r = previousMonthRange(new Date('2028-03-10T12:00:00Z'));
		expect(r.end).toBe('2028-02-29');
	});

	it('uses the Pacific date, not UTC, near midnight', () => {
		// 2026-10-01 03:00 UTC is still Sep 30 in Pacific → previous month is August
		const r = previousMonthRange(new Date('2026-10-01T03:00:00Z'));
		expect(r.start).toBe('2026-08-01');
	});
});

import { summarizeBooth } from '$lib/server/floorplan/revenue';

describe('summarizeBooth (shared booths)', () => {
	const rosie = { nrsVendorId: 17160, code: 'ROSIE', name: 'Christina McCarthy', grossSales: 400, storeShare: 52, rent: 0 };
	const bmc = { nrsVendorId: 17159, code: 'BMC', name: 'Tami Swartz', grossSales: 600, storeShare: 78, rent: 250 };

	it('sums every occupant\'s store share and all rent over the shared cells', () => {
		const b = summarizeBooth('Sep 2026', [bmc, rosie], 90, ['McCarthy / Swartz']);
		expect(b.shared).toBe(true);
		expect(b.grossSales).toBe(1000);
		expect(b.storeShare).toBe(130);
		expect(b.rent).toBe(250);
		expect(b.storeRevenue).toBe(380);
		expect(b.perSqft).toBeCloseTo(380 / 90);
		expect(b.occupants.map((o) => o.code)).toEqual(['BMC', 'ROSIE']);
	});

	it('is a plain booth for a lone vendor and null per sq ft with no cells', () => {
		const b = summarizeBooth('Sep 2026', [rosie], 0, []);
		expect(b.shared).toBe(false);
		expect(b.perSqft).toBeNull();
		expect(b.storeRevenue).toBe(52);
	});
});
