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
