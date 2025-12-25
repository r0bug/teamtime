/**
 * @module Tests/Services/PointsService
 * @description Unit tests for the gamification points service.
 *
 * Tests cover:
 * - Point value constants
 * - Streak multiplier calculations
 * - Level progression calculations
 * - Category-specific point logic
 */

import { describe, it, expect } from 'vitest';
import {
	POINT_VALUES,
	STREAK_MULTIPLIERS,
	STREAK_BONUSES,
	LEVEL_THRESHOLDS,
	getStreakMultiplier,
	calculateLevel
} from '$lib/server/services/points-service';

describe('Points Service', () => {
	describe('POINT_VALUES constants', () => {
		it('should have positive values for good actions', () => {
			expect(POINT_VALUES.CLOCK_IN_ON_TIME).toBeGreaterThan(0);
			expect(POINT_VALUES.CLOCK_IN_EARLY).toBeGreaterThan(0);
			expect(POINT_VALUES.TASK_COMPLETE).toBeGreaterThan(0);
			expect(POINT_VALUES.PRICING_SUBMIT).toBeGreaterThan(0);
		});

		it('should have negative values for bad actions', () => {
			expect(POINT_VALUES.CLOCK_IN_LATE_PER_5MIN).toBeLessThan(0);
			expect(POINT_VALUES.CLOCK_OUT_FORGOTTEN).toBeLessThan(0);
			expect(POINT_VALUES.TASK_COMPLETE_LATE).toBeLessThan(0);
			expect(POINT_VALUES.PRICING_GRADE_POOR).toBeLessThan(0);
		});

		it('should cap late clock-in penalties', () => {
			expect(POINT_VALUES.CLOCK_IN_LATE_MAX).toBe(-20);
		});

		it('should reward early clock-in more than on-time', () => {
			expect(POINT_VALUES.CLOCK_IN_EARLY).toBeGreaterThan(POINT_VALUES.CLOCK_IN_ON_TIME);
		});

		it('should have higher rewards for better pricing grades', () => {
			expect(POINT_VALUES.PRICING_GRADE_EXCELLENT).toBeGreaterThan(POINT_VALUES.PRICING_GRADE_GOOD);
			expect(POINT_VALUES.PRICING_GRADE_GOOD).toBeGreaterThan(POINT_VALUES.PRICING_GRADE_ACCEPTABLE);
			expect(POINT_VALUES.PRICING_GRADE_ACCEPTABLE).toBeGreaterThan(POINT_VALUES.PRICING_GRADE_POOR);
		});
	});

	describe('STREAK_MULTIPLIERS', () => {
		it('should start at 1.0 for no streak', () => {
			expect(STREAK_MULTIPLIERS[0]).toBe(1.0);
		});

		it('should increase with longer streaks', () => {
			expect(STREAK_MULTIPLIERS[7]).toBeGreaterThan(STREAK_MULTIPLIERS[3]);
			expect(STREAK_MULTIPLIERS[30]).toBeGreaterThan(STREAK_MULTIPLIERS[7]);
		});

		it('should cap at 1.5x for 30-day streaks', () => {
			expect(STREAK_MULTIPLIERS[30]).toBe(1.5);
		});
	});

	describe('STREAK_BONUSES', () => {
		it('should award bonus at 3-day streak', () => {
			expect(STREAK_BONUSES[3]).toBeDefined();
			expect(STREAK_BONUSES[3]).toBeGreaterThan(0);
		});

		it('should increase bonus for longer streaks', () => {
			expect(STREAK_BONUSES[7]).toBeGreaterThan(STREAK_BONUSES[5]);
			expect(STREAK_BONUSES[14]).toBeGreaterThan(STREAK_BONUSES[7]);
			expect(STREAK_BONUSES[30]).toBeGreaterThan(STREAK_BONUSES[14]);
		});
	});

	describe('LEVEL_THRESHOLDS', () => {
		it('should have 10 levels', () => {
			expect(LEVEL_THRESHOLDS).toHaveLength(10);
		});

		it('should start at level 1 with 0 points', () => {
			expect(LEVEL_THRESHOLDS[0].level).toBe(1);
			expect(LEVEL_THRESHOLDS[0].minPoints).toBe(0);
		});

		it('should have increasing point requirements', () => {
			for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
				expect(LEVEL_THRESHOLDS[i].minPoints).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1].minPoints);
			}
		});

		it('should have meaningful level names', () => {
			expect(LEVEL_THRESHOLDS[0].name).toBe('Newcomer');
			expect(LEVEL_THRESHOLDS[9].name).toBe('Champion');
		});

		it('should require 100,000 points for max level', () => {
			expect(LEVEL_THRESHOLDS[9].minPoints).toBe(100000);
		});
	});

	describe('getStreakMultiplier', () => {
		it('should return 1.0 for 0-day streak', () => {
			expect(getStreakMultiplier(0)).toBe(1.0);
		});

		it('should return 1.0 for 1-day streak', () => {
			expect(getStreakMultiplier(1)).toBe(1.0);
		});

		it('should return 1.0 for 2-day streak', () => {
			expect(getStreakMultiplier(2)).toBe(1.0);
		});

		it('should return 1.1 for 3-day streak', () => {
			expect(getStreakMultiplier(3)).toBe(1.1);
		});

		it('should return 1.2 for 5-day streak', () => {
			expect(getStreakMultiplier(5)).toBe(1.2);
		});

		it('should return 1.3 for 7-day streak', () => {
			expect(getStreakMultiplier(7)).toBe(1.3);
		});

		it('should return 1.4 for 14-day streak', () => {
			expect(getStreakMultiplier(14)).toBe(1.4);
		});

		it('should return 1.5 for 30-day streak', () => {
			expect(getStreakMultiplier(30)).toBe(1.5);
		});

		it('should return 1.5 for streaks beyond 30 days', () => {
			expect(getStreakMultiplier(50)).toBe(1.5);
			expect(getStreakMultiplier(100)).toBe(1.5);
		});

		it('should use the highest threshold that applies', () => {
			// 10 days should use the 7-day threshold (1.3)
			expect(getStreakMultiplier(10)).toBe(1.3);
			// 20 days should use the 14-day threshold (1.4)
			expect(getStreakMultiplier(20)).toBe(1.4);
		});
	});

	describe('calculateLevel', () => {
		it('should return level 1 for 0 points', () => {
			const result = calculateLevel(0);
			expect(result.level).toBe(1);
			expect(result.name).toBe('Newcomer');
			expect(result.progress).toBe(0);
		});

		it('should return level 1 with progress for points below 500', () => {
			const result = calculateLevel(250);
			expect(result.level).toBe(1);
			expect(result.progress).toBe(50); // 250/500 = 50%
		});

		it('should return level 2 at 500 points', () => {
			const result = calculateLevel(500);
			expect(result.level).toBe(2);
			expect(result.name).toBe('Trainee');
		});

		it('should return level 3 at 1500 points', () => {
			const result = calculateLevel(1500);
			expect(result.level).toBe(3);
			expect(result.name).toBe('Team Member');
		});

		it('should return level 10 at 100,000 points', () => {
			const result = calculateLevel(100000);
			expect(result.level).toBe(10);
			expect(result.name).toBe('Champion');
		});

		it('should return level 10 for points beyond 100,000', () => {
			const result = calculateLevel(200000);
			expect(result.level).toBe(10);
			expect(result.name).toBe('Champion');
			expect(result.progress).toBe(100);
		});

		it('should calculate correct progress percentage', () => {
			// Level 1 requires 500 points for next level
			// At 125 points: 125/500 = 25%
			const result = calculateLevel(125);
			expect(result.progress).toBe(25);
		});

		it('should include nextLevelPoints in result', () => {
			const result = calculateLevel(0);
			expect(result.nextLevelPoints).toBe(500); // Level 2 threshold
		});

		it('should show next level as current level at max', () => {
			const result = calculateLevel(100000);
			expect(result.nextLevelPoints).toBe(100000);
		});
	});
});
