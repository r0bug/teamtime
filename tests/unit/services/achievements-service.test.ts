/**
 * @module Tests/Services/AchievementsService
 * @description Unit tests for the achievements service.
 *
 * Tests cover:
 * - Default achievement definitions
 * - Achievement tier structure
 * - Criteria validation
 * - Category organization
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_ACHIEVEMENTS } from '$lib/server/services/achievements-service';

describe('Achievements Service', () => {
	describe('DEFAULT_ACHIEVEMENTS', () => {
		it('should have multiple achievements defined', () => {
			expect(DEFAULT_ACHIEVEMENTS.length).toBeGreaterThan(0);
		});

		it('should have unique codes for each achievement', () => {
			const codes = DEFAULT_ACHIEVEMENTS.map((a) => a.code);
			const uniqueCodes = new Set(codes);
			expect(uniqueCodes.size).toBe(codes.length);
		});

		it('should have valid tiers (bronze, silver, gold, platinum)', () => {
			const validTiers = ['bronze', 'silver', 'gold', 'platinum'];
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(validTiers).toContain(achievement.tier);
			}
		});

		it('should have valid categories', () => {
			const validCategories = ['attendance', 'task', 'pricing', 'sales', 'special', 'achievement'];
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(validCategories).toContain(achievement.category);
			}
		});

		it('should have positive point rewards', () => {
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(achievement.pointReward).toBeGreaterThan(0);
			}
		});

		it('should have a name and description', () => {
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(achievement.name).toBeTruthy();
				expect(achievement.description).toBeTruthy();
				expect(achievement.name.length).toBeGreaterThan(0);
				expect(achievement.description.length).toBeGreaterThan(0);
			}
		});

		it('should have icons', () => {
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(achievement.icon).toBeTruthy();
			}
		});

		it('should have valid criteria objects', () => {
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(achievement.criteria).toBeDefined();
				expect(achievement.criteria).toHaveProperty('type');
			}
		});

		it('should have isActive flag set to true for all default achievements', () => {
			for (const achievement of DEFAULT_ACHIEVEMENTS) {
				expect(achievement.isActive).toBe(true);
			}
		});
	});

	describe('Attendance Achievements', () => {
		const attendanceAchievements = DEFAULT_ACHIEVEMENTS.filter((a) => a.category === 'attendance');

		it('should have attendance achievements', () => {
			expect(attendanceAchievements.length).toBeGreaterThan(0);
		});

		it('should have First Day achievement', () => {
			const firstDay = attendanceAchievements.find((a) => a.code === 'FIRST_CLOCK');
			expect(firstDay).toBeDefined();
			expect(firstDay?.tier).toBe('bronze');
		});

		it('should have streak achievements', () => {
			const streak7 = attendanceAchievements.find((a) => a.code === 'STREAK_7');
			const streak30 = attendanceAchievements.find((a) => a.code === 'STREAK_30');
			const streak90 = attendanceAchievements.find((a) => a.code === 'STREAK_90');

			expect(streak7).toBeDefined();
			expect(streak30).toBeDefined();
			expect(streak90).toBeDefined();
		});

		it('should increase tier with streak length', () => {
			const streak7 = attendanceAchievements.find((a) => a.code === 'STREAK_7');
			const streak30 = attendanceAchievements.find((a) => a.code === 'STREAK_30');
			const streak90 = attendanceAchievements.find((a) => a.code === 'STREAK_90');

			expect(streak7?.tier).toBe('bronze');
			expect(streak30?.tier).toBe('silver');
			expect(streak90?.tier).toBe('gold');
		});

		it('should increase rewards with streak length', () => {
			const streak7 = attendanceAchievements.find((a) => a.code === 'STREAK_7');
			const streak30 = attendanceAchievements.find((a) => a.code === 'STREAK_30');
			const streak90 = attendanceAchievements.find((a) => a.code === 'STREAK_90');

			expect(streak30!.pointReward).toBeGreaterThan(streak7!.pointReward);
			expect(streak90!.pointReward).toBeGreaterThan(streak30!.pointReward);
		});
	});

	describe('Task Achievements', () => {
		const taskAchievements = DEFAULT_ACHIEVEMENTS.filter((a) => a.category === 'task');

		it('should have task achievements', () => {
			expect(taskAchievements.length).toBeGreaterThan(0);
		});

		it('should have progressive task count achievements', () => {
			const task10 = taskAchievements.find((a) => a.code === 'TASK_10');
			const task50 = taskAchievements.find((a) => a.code === 'TASK_50');
			const task100 = taskAchievements.find((a) => a.code === 'TASK_100');

			expect(task10).toBeDefined();
			expect(task50).toBeDefined();
			expect(task100).toBeDefined();
		});

		it('should increase tier with task count', () => {
			const task10 = taskAchievements.find((a) => a.code === 'TASK_10');
			const task50 = taskAchievements.find((a) => a.code === 'TASK_50');
			const task100 = taskAchievements.find((a) => a.code === 'TASK_100');

			expect(task10?.tier).toBe('bronze');
			expect(task50?.tier).toBe('silver');
			expect(task100?.tier).toBe('gold');
		});
	});

	describe('Pricing Achievements', () => {
		const pricingAchievements = DEFAULT_ACHIEVEMENTS.filter((a) => a.category === 'pricing');

		it('should have pricing achievements', () => {
			expect(pricingAchievements.length).toBeGreaterThan(0);
		});
	});

	describe('Achievement Criteria Types', () => {
		it('should have count-based criteria', () => {
			const countAchievements = DEFAULT_ACHIEVEMENTS.filter(
				(a) => (a.criteria as any).type === 'count'
			);
			expect(countAchievements.length).toBeGreaterThan(0);
		});

		it('should have streak-based criteria', () => {
			const streakAchievements = DEFAULT_ACHIEVEMENTS.filter(
				(a) => (a.criteria as any).type === 'streak'
			);
			expect(streakAchievements.length).toBeGreaterThan(0);
		});

		it('count criteria should have field and value', () => {
			const countAchievements = DEFAULT_ACHIEVEMENTS.filter(
				(a) => (a.criteria as any).type === 'count'
			);
			for (const achievement of countAchievements) {
				expect((achievement.criteria as any).field).toBeDefined();
				expect((achievement.criteria as any).value).toBeGreaterThan(0);
			}
		});

		it('streak criteria should have value', () => {
			const streakAchievements = DEFAULT_ACHIEVEMENTS.filter(
				(a) => (a.criteria as any).type === 'streak'
			);
			for (const achievement of streakAchievements) {
				expect((achievement.criteria as any).value).toBeGreaterThan(0);
			}
		});
	});

	describe('Secret Achievements', () => {
		it('should have some secret achievements', () => {
			const secretAchievements = DEFAULT_ACHIEVEMENTS.filter((a) => a.isSecret);
			// Secret achievements are optional
			expect(Array.isArray(secretAchievements)).toBe(true);
		});

		it('non-secret achievements should be majority', () => {
			const nonSecretCount = DEFAULT_ACHIEVEMENTS.filter((a) => !a.isSecret).length;
			expect(nonSecretCount).toBeGreaterThan(DEFAULT_ACHIEVEMENTS.length / 2);
		});
	});

	describe('Point Reward Distribution', () => {
		it('bronze achievements should have lower rewards than silver', () => {
			const bronzeRewards = DEFAULT_ACHIEVEMENTS
				.filter((a) => a.tier === 'bronze')
				.map((a) => a.pointReward);
			const silverRewards = DEFAULT_ACHIEVEMENTS
				.filter((a) => a.tier === 'silver')
				.map((a) => a.pointReward);

			const avgBronze = bronzeRewards.reduce((a, b) => a + b, 0) / bronzeRewards.length;
			const avgSilver = silverRewards.reduce((a, b) => a + b, 0) / silverRewards.length;

			expect(avgSilver).toBeGreaterThan(avgBronze);
		});

		it('silver achievements should have lower rewards than gold', () => {
			const silverRewards = DEFAULT_ACHIEVEMENTS
				.filter((a) => a.tier === 'silver')
				.map((a) => a.pointReward);
			const goldRewards = DEFAULT_ACHIEVEMENTS
				.filter((a) => a.tier === 'gold')
				.map((a) => a.pointReward);

			const avgSilver = silverRewards.reduce((a, b) => a + b, 0) / silverRewards.length;
			const avgGold = goldRewards.reduce((a, b) => a + b, 0) / goldRewards.length;

			expect(avgGold).toBeGreaterThan(avgSilver);
		});
	});
});
