/**
 * @module Tests/Timezone
 * @description Unit tests for Pacific timezone utilities.
 *
 * These tests verify correct behavior for:
 * - Timezone offset calculation (PST vs PDT)
 * - Date parsing in Pacific time
 * - Day boundary calculations
 * - DST transitions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getPacificOffset,
	parsePacificDatetime,
	parsePacificDate,
	parsePacificEndOfDay,
	getPacificDayBounds,
	getPacificDateParts,
	getPacificHour,
	getPacificWeekday,
	toPacificDateString,
	toPacificTimeString,
	isSamePacificDay,
	isPacificToday,
	createPacificDateTime,
	getPacificTimezoneName
} from '$lib/server/utils/timezone';

describe('Timezone Utilities', () => {
	describe('getPacificOffset', () => {
		it('should return -8 for PST (winter) dates', () => {
			// January 15, 2024 is in PST
			const winterDate = new Date('2024-01-15T12:00:00Z');
			expect(getPacificOffset(winterDate)).toBe(-8);
		});

		it('should return -7 for PDT (summer) dates', () => {
			// July 15, 2024 is in PDT
			const summerDate = new Date('2024-07-15T12:00:00Z');
			expect(getPacificOffset(summerDate)).toBe(-7);
		});

		it('should handle DST transition dates', () => {
			// March 10, 2024 - DST starts (spring forward)
			// At 2 AM PST becomes 3 AM PDT
			const beforeDST = new Date('2024-03-10T09:00:00Z'); // 1 AM PST
			const afterDST = new Date('2024-03-10T11:00:00Z'); // 4 AM PDT

			expect(getPacificOffset(beforeDST)).toBe(-8);
			expect(getPacificOffset(afterDST)).toBe(-7);
		});
	});

	describe('parsePacificDatetime', () => {
		it('should parse PST datetime correctly', () => {
			// 9:00 AM PST on Jan 15, 2024 = 17:00 UTC
			const result = parsePacificDatetime('2024-01-15T09:00');
			expect(result.toISOString()).toBe('2024-01-15T17:00:00.000Z');
		});

		it('should parse PDT datetime correctly', () => {
			// 9:00 AM PDT on Jul 15, 2024 = 16:00 UTC
			const result = parsePacificDatetime('2024-07-15T09:00');
			expect(result.toISOString()).toBe('2024-07-15T16:00:00.000Z');
		});

		it('should handle midnight correctly', () => {
			// Midnight PST on Jan 15, 2024 = 08:00 UTC
			const result = parsePacificDatetime('2024-01-15T00:00');
			expect(result.toISOString()).toBe('2024-01-15T08:00:00.000Z');
		});
	});

	describe('parsePacificDate', () => {
		it('should parse date as Pacific midnight', () => {
			// Midnight PST on Jan 15, 2024 = 08:00 UTC
			const result = parsePacificDate('2024-01-15');
			expect(result.toISOString()).toBe('2024-01-15T08:00:00.000Z');
		});

		it('should handle PDT dates', () => {
			// Midnight PDT on Jul 15, 2024 = 07:00 UTC
			const result = parsePacificDate('2024-07-15');
			expect(result.toISOString()).toBe('2024-07-15T07:00:00.000Z');
		});
	});

	describe('parsePacificEndOfDay', () => {
		it('should parse end of day in PST', () => {
			// 23:59:59.999 PST = next day 07:59:59.999 UTC
			const result = parsePacificEndOfDay('2024-01-15');
			expect(result.getUTCHours()).toBe(7); // 23 - (-8) = 31, mod 24 = 7
			expect(result.getUTCMinutes()).toBe(59);
			expect(result.getUTCSeconds()).toBe(59);
		});

		it('should parse end of day in PDT', () => {
			// 23:59:59.999 PDT = next day 06:59:59.999 UTC
			const result = parsePacificEndOfDay('2024-07-15');
			expect(result.getUTCHours()).toBe(6); // 23 - (-7) = 30, mod 24 = 6
			expect(result.getUTCMinutes()).toBe(59);
			expect(result.getUTCSeconds()).toBe(59);
		});
	});

	describe('getPacificDayBounds', () => {
		it('should return correct start and end of day', () => {
			// Using noon to avoid timezone boundary issues
			const date = new Date('2024-01-15T20:00:00Z'); // Noon PST
			const { start, end } = getPacificDayBounds(date);

			// Start should be midnight PST (08:00 UTC)
			expect(start.toISOString()).toBe('2024-01-15T08:00:00.000Z');

			// End should be 23:59:59.999 PST
			expect(end.getUTCDate()).toBe(16); // Next day UTC
			expect(end.getUTCHours()).toBe(7);
			expect(end.getUTCMinutes()).toBe(59);
		});

		it('should handle day boundary correctly at UTC midnight', () => {
			// This is a critical test - UTC midnight could be the previous or next Pacific day
			const utcMidnight = new Date('2024-01-15T00:00:00Z'); // Still Jan 14 in Pacific
			const { start, end } = getPacificDayBounds(utcMidnight);

			// Should get Jan 14 Pacific day
			const startPacific = toPacificDateString(start);
			expect(startPacific).toBe('2024-01-14');
		});
	});

	describe('getPacificDateParts', () => {
		it('should extract correct date parts', () => {
			// 5:30:15 PM PST on Jan 15, 2024 = 01:30:15 UTC Jan 16
			const date = new Date('2024-01-16T01:30:15Z');
			const parts = getPacificDateParts(date);

			expect(parts.year).toBe(2024);
			expect(parts.month).toBe(1);
			expect(parts.day).toBe(15);
			expect(parts.hour).toBe(17); // 5 PM
			expect(parts.minute).toBe(30);
			expect(parts.second).toBe(15);
		});

		it('should return correct weekday', () => {
			// Jan 15, 2024 is a Monday
			const date = new Date('2024-01-15T20:00:00Z'); // Noon PST
			const parts = getPacificDateParts(date);
			expect(parts.weekday).toBe(1); // Monday = 1
		});
	});

	describe('toPacificDateString', () => {
		it('should format date correctly', () => {
			const date = new Date('2024-01-15T20:00:00Z');
			expect(toPacificDateString(date)).toBe('2024-01-15');
		});

		it('should handle day boundary', () => {
			// 1 AM UTC on Jan 16 = 5 PM PST on Jan 15
			const date = new Date('2024-01-16T01:00:00Z');
			expect(toPacificDateString(date)).toBe('2024-01-15');
		});
	});

	describe('isSamePacificDay', () => {
		it('should return true for same Pacific day', () => {
			const date1 = new Date('2024-01-15T10:00:00Z'); // 2 AM PST
			const date2 = new Date('2024-01-16T05:00:00Z'); // 9 PM PST (still Jan 15)
			expect(isSamePacificDay(date1, date2)).toBe(true);
		});

		it('should return false for different Pacific days', () => {
			const date1 = new Date('2024-01-15T10:00:00Z'); // 2 AM PST Jan 15
			const date2 = new Date('2024-01-16T10:00:00Z'); // 2 AM PST Jan 16
			expect(isSamePacificDay(date1, date2)).toBe(false);
		});
	});

	describe('createPacificDateTime', () => {
		it('should create correct UTC time from Pacific time', () => {
			// 9:30 AM PST = 17:30 UTC
			const result = createPacificDateTime('2024-01-15', 9, 30);
			expect(result.toISOString()).toBe('2024-01-15T17:30:00.000Z');
		});

		it('should handle PDT', () => {
			// 9:30 AM PDT = 16:30 UTC
			const result = createPacificDateTime('2024-07-15', 9, 30);
			expect(result.toISOString()).toBe('2024-07-15T16:30:00.000Z');
		});
	});

	describe('getPacificTimezoneName', () => {
		it('should return PST or PDT', () => {
			const name = getPacificTimezoneName();
			expect(['PST', 'PDT', 'PT']).toContain(name);
		});
	});
});
