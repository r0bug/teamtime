/**
 * @module Tests/BreakAllowance
 * @description Unit tests for the paid-break allowance calculation.
 *
 * Workers earn a paid break allowance (state minimum: 15 min per 4 hours
 * worked). Only break time beyond the allowance is unpaid and deducted from
 * the shift's paid hours.
 */

import { describe, it, expect } from 'vitest';
import { computePaidHours, DEFAULT_BREAK_ALLOWANCE } from '$lib/server/utils/break-allowance';

describe('computePaidHours', () => {
	it('pays the full shift when no break is taken', () => {
		const r = computePaidHours(8, 0);
		expect(r.paidHours).toBe(8);
		expect(r.excessBreakMinutes).toBe(0);
	});

	it('keeps a break within the allowance fully paid (15 min on an 8h shift)', () => {
		// 8h earns 30 min allowance, so a 15 min break is entirely paid
		const r = computePaidHours(8, 15);
		expect(r.allowedBreakMinutes).toBe(30);
		expect(r.excessBreakMinutes).toBe(0);
		expect(r.paidHours).toBe(8);
	});

	it('deducts only the portion of break time beyond the allowance', () => {
		// 4h earns 15 min allowance; a 30 min break has 15 unpaid minutes
		const r = computePaidHours(4, 30);
		expect(r.allowedBreakMinutes).toBe(15);
		expect(r.excessBreakMinutes).toBe(15);
		expect(r.paidHours).toBe(3.75);
	});

	it('handles a long break that far exceeds the allowance', () => {
		// 9h span with a 3h (180 min) break: allowance 33.75 min, 146.25 unpaid
		const r = computePaidHours(9, 180);
		expect(r.allowedBreakMinutes).toBe(33.75);
		expect(r.excessBreakMinutes).toBe(146.25);
		expect(r.paidHours).toBeCloseTo(6.56, 2);
	});

	it('never returns negative paid hours', () => {
		const r = computePaidHours(1, 600);
		expect(r.paidHours).toBe(0);
	});

	it('respects a custom allowance config', () => {
		// 10 min per 2 hours => 4h earns 20 min; a 40 min break has 20 unpaid
		const r = computePaidHours(4, 40, { minutesPer: 10, perHours: 2 });
		expect(r.allowedBreakMinutes).toBe(20);
		expect(r.excessBreakMinutes).toBe(20);
		expect(r.paidHours).toBeCloseTo(3.667, 2);
	});

	it('defaults to the state minimum of 15 min / 4 hr', () => {
		expect(DEFAULT_BREAK_ALLOWANCE).toEqual({ minutesPer: 15, perHours: 4 });
	});
});
