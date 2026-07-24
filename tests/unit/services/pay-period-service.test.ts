import { describe, it, expect } from 'vitest';
import {
	getCurrentPayPeriod,
	DEFAULT_PAY_PERIOD_CONFIG,
	type PayPeriodConfig
} from '$lib/server/services/pay-period-service';
import { toPacificDateString } from '$lib/server/utils/timezone';

// Noon Pacific on a given date — unambiguous regardless of DST.
function pacificNoon(dateStr: string): Date {
	return new Date(`${dateStr}T12:00:00-07:00`);
}

function bounds(period: { startDate: Date; endDate: Date }): [string, string] {
	return [toPacificDateString(period.startDate), toPacificDateString(period.endDate)];
}

describe('getCurrentPayPeriod — semi-monthly (default 26–10 / 11–25)', () => {
	it('mid-month lands in period 2 (11th–25th)', () => {
		const p = getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-07-24'))!;
		expect(bounds(p)).toEqual(['2026-07-11', '2026-07-25']);
	});

	it('the 26th starts period 1, running into next month', () => {
		const p = getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-07-26'))!;
		expect(bounds(p)).toEqual(['2026-07-26', '2026-08-10']);
	});

	it('early month still belongs to period 1 started last month', () => {
		const p = getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-08-05'))!;
		expect(bounds(p)).toEqual(['2026-07-26', '2026-08-10']);
	});

	it('boundary days: 10th closes period 1, 11th opens period 2, 25th closes it', () => {
		expect(bounds(getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-08-10'))!)).toEqual([
			'2026-07-26',
			'2026-08-10'
		]);
		expect(bounds(getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-08-11'))!)).toEqual([
			'2026-08-11',
			'2026-08-25'
		]);
		expect(bounds(getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-08-25'))!)).toEqual([
			'2026-08-11',
			'2026-08-25'
		]);
	});

	it('crosses the year boundary in both directions', () => {
		expect(bounds(getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-12-28'))!)).toEqual([
			'2026-12-26',
			'2027-01-10'
		]);
		expect(bounds(getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2027-01-03'))!)).toEqual([
			'2026-12-26',
			'2027-01-10'
		]);
	});

	it('endDate is Pacific end-of-day, startDate Pacific midnight', () => {
		const p = getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-07-24'))!;
		// Pacific midnight Jul 11 PDT = 07:00 UTC
		expect(p.startDate.toISOString()).toBe('2026-07-11T07:00:00.000Z');
		// Pacific 23:59:59.999 Jul 25 PDT = Jul 26 06:59:59.999 UTC
		expect(p.endDate.toISOString()).toBe('2026-07-26T06:59:59.999Z');
	});

	it('produces a readable date-range label', () => {
		const p = getCurrentPayPeriod(DEFAULT_PAY_PERIOD_CONFIG, pacificNoon('2026-07-24'))!;
		expect(p.label).toBe('Jul 11 – Jul 25');
	});
});

describe('getCurrentPayPeriod — other types', () => {
	it('weekly runs Sunday through Saturday of the current Pacific week', () => {
		const config: PayPeriodConfig = { ...DEFAULT_PAY_PERIOD_CONFIG, type: 'weekly' };
		// 2026-07-24 is a Friday
		const p = getCurrentPayPeriod(config, pacificNoon('2026-07-24'))!;
		expect(bounds(p)).toEqual(['2026-07-19', '2026-07-25']);
	});

	it('monthly runs the full calendar month', () => {
		const config: PayPeriodConfig = { ...DEFAULT_PAY_PERIOD_CONFIG, type: 'monthly' };
		const p = getCurrentPayPeriod(config, pacificNoon('2026-02-15'))!;
		expect(bounds(p)).toEqual(['2026-02-01', '2026-02-28']);
	});

	it('bi-weekly is unsupported (no anchor in config) and returns null', () => {
		const config: PayPeriodConfig = { ...DEFAULT_PAY_PERIOD_CONFIG, type: 'bi-weekly' };
		expect(getCurrentPayPeriod(config, pacificNoon('2026-07-24'))).toBeNull();
	});
});
