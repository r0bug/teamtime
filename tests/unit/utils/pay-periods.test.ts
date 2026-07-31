import { describe, it, expect, vi } from 'vitest';

// pay-periods imports the db only for loadPayPeriodConfig; the calculation
// functions under test are pure. Stub the db module so the import stays clean.
vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }) },
	appSettings: {}
}));

import {
	calculatePayPeriods,
	lastCompletedPayPeriod,
	formatShortDate,
	DEFAULT_PAY_PERIOD_CONFIG
} from '$lib/server/utils/pay-periods';

describe('calculatePayPeriods (semi-monthly 26-10 / 11-25)', () => {
	it('generates correct periods around a mid-cycle date', () => {
		const periods = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-30');
		const ranges = periods.map((p) => `${p.startDate}..${p.endDate}`);

		expect(ranges).toContain('2026-06-26..2026-07-10');
		expect(ranges).toContain('2026-07-11..2026-07-25');
		expect(ranges).toContain('2026-07-26..2026-08-10');

		// Newest first
		expect(periods[0].startDate >= periods[1].startDate).toBe(true);
	});

	it('marks only the period containing today as current', () => {
		const periods = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-30');
		const current = periods.filter((p) => p.isCurrent);
		expect(current).toHaveLength(1);
		expect(current[0].startDate).toBe('2026-07-26');
		expect(current[0].endDate).toBe('2026-08-10');
	});

	it('handles year boundaries (period crossing Dec/Jan)', () => {
		const periods = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-01-05');
		const ranges = periods.map((p) => `${p.startDate}..${p.endDate}`);
		expect(ranges).toContain('2025-12-26..2026-01-10');
		expect(ranges).toContain('2025-12-11..2025-12-25');
	});

	it('is a boundary day inclusive on both ends', () => {
		const onStart = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-11');
		expect(onStart.find((p) => p.isCurrent)?.startDate).toBe('2026-07-11');

		const onEnd = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-25');
		expect(onEnd.find((p) => p.isCurrent)?.endDate).toBe('2026-07-25');
	});
});

describe('lastCompletedPayPeriod', () => {
	it('returns the most recently ended, non-current period', () => {
		const periods = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-30');
		const last = lastCompletedPayPeriod(periods, '2026-07-30');
		expect(last?.startDate).toBe('2026-07-11');
		expect(last?.endDate).toBe('2026-07-25');
	});

	it('does not return the current period on its last day', () => {
		const periods = calculatePayPeriods(DEFAULT_PAY_PERIOD_CONFIG, 8, '2026-07-25');
		const last = lastCompletedPayPeriod(periods, '2026-07-25');
		expect(last?.startDate).toBe('2026-06-26');
		expect(last?.endDate).toBe('2026-07-10');
	});
});

describe('formatShortDate', () => {
	it('formats without timezone shift', () => {
		expect(formatShortDate('2026-07-11')).toBe('Jul 11');
		expect(formatShortDate('2026-01-01')).toBe('Jan 1');
		expect(formatShortDate('2025-12-31')).toBe('Dec 31');
	});
});
