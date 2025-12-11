import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export interface PayPeriodConfig {
	type: 'semi-monthly' | 'bi-weekly' | 'weekly' | 'monthly';
	// For semi-monthly
	period1Start: number; // Day of month (e.g., 26)
	period1End: number; // Day of month (e.g., 10)
	period1Payday: number; // Day of month (e.g., 1)
	period2Start: number; // Day of month (e.g., 11)
	period2End: number; // Day of month (e.g., 25)
	period2Payday: number; // Day of month (e.g., 16)
	// For bi-weekly
	biWeeklyStartDate?: string; // ISO date of a known pay period start
	biWeeklyPayday?: number; // Days after period end (e.g., 5)
}

const DEFAULT_CONFIG: PayPeriodConfig = {
	type: 'semi-monthly',
	period1Start: 26,
	period1End: 10,
	period1Payday: 1,
	period2Start: 11,
	period2End: 25,
	period2Payday: 16
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get pay period config from settings
	const setting = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'pay_period_config'))
		.limit(1);

	let config: PayPeriodConfig = DEFAULT_CONFIG;
	if (setting.length > 0) {
		try {
			config = JSON.parse(setting[0].value);
		} catch {
			config = DEFAULT_CONFIG;
		}
	}

	// Calculate current and recent pay periods for preview
	const payPeriods = calculatePayPeriods(config, 6);

	return {
		config,
		payPeriods
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const type = formData.get('type') as string;

		const config: PayPeriodConfig = {
			type: type as PayPeriodConfig['type'],
			period1Start: parseInt(formData.get('period1Start') as string, 10) || 26,
			period1End: parseInt(formData.get('period1End') as string, 10) || 10,
			period1Payday: parseInt(formData.get('period1Payday') as string, 10) || 1,
			period2Start: parseInt(formData.get('period2Start') as string, 10) || 11,
			period2End: parseInt(formData.get('period2End') as string, 10) || 25,
			period2Payday: parseInt(formData.get('period2Payday') as string, 10) || 16
		};

		// Validate
		if (config.type === 'semi-monthly') {
			if (config.period1Start < 1 || config.period1Start > 31 ||
				config.period1End < 1 || config.period1End > 31 ||
				config.period1Payday < 1 || config.period1Payday > 31 ||
				config.period2Start < 1 || config.period2Start > 31 ||
				config.period2End < 1 || config.period2End > 31 ||
				config.period2Payday < 1 || config.period2Payday > 31) {
				return fail(400, { error: 'Invalid day values. Must be between 1 and 31.' });
			}
		}

		// Upsert the setting
		const existing = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'pay_period_config'))
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(appSettings)
				.set({ value: JSON.stringify(config), updatedAt: new Date() })
				.where(eq(appSettings.key, 'pay_period_config'));
		} else {
			await db.insert(appSettings).values({
				key: 'pay_period_config',
				value: JSON.stringify(config)
			});
		}

		return { success: true, message: 'Pay period settings saved successfully' };
	}
};

interface PayPeriod {
	startDate: Date;
	endDate: Date;
	payday: Date;
	label: string;
	isCurrent: boolean;
}

function calculatePayPeriods(config: PayPeriodConfig, count: number): PayPeriod[] {
	const periods: PayPeriod[] = [];
	const now = new Date();
	const currentDay = now.getDate();
	const currentMonth = now.getMonth();
	const currentYear = now.getFullYear();

	if (config.type === 'semi-monthly') {
		// Generate pay periods for the past few months and future
		for (let monthOffset = -2; monthOffset <= 2; monthOffset++) {
			const targetMonth = currentMonth + monthOffset;
			const targetYear = currentYear + Math.floor(targetMonth / 12);
			const adjustedMonth = ((targetMonth % 12) + 12) % 12;

			// Period 1: crosses month boundary (e.g., 26th to 10th)
			if (config.period1Start > config.period1End) {
				const startDate = new Date(targetYear, adjustedMonth - 1, config.period1Start);
				const endDate = new Date(targetYear, adjustedMonth, config.period1End, 23, 59, 59);
				const payday = new Date(targetYear, adjustedMonth, config.period1Payday);

				const isCurrent = now >= startDate && now <= endDate;

				periods.push({
					startDate,
					endDate,
					payday,
					label: `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`,
					isCurrent
				});
			} else {
				// Period 1 doesn't cross month boundary
				const startDate = new Date(targetYear, adjustedMonth, config.period1Start);
				const endDate = new Date(targetYear, adjustedMonth, config.period1End, 23, 59, 59);
				const payday = new Date(targetYear, adjustedMonth, config.period1Payday);

				const isCurrent = now >= startDate && now <= endDate;

				periods.push({
					startDate,
					endDate,
					payday,
					label: `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`,
					isCurrent
				});
			}

			// Period 2: within same month (e.g., 11th to 25th)
			const p2StartDate = new Date(targetYear, adjustedMonth, config.period2Start);
			const p2EndDate = new Date(targetYear, adjustedMonth, config.period2End, 23, 59, 59);
			const p2Payday = new Date(targetYear, adjustedMonth, config.period2Payday);

			const p2IsCurrent = now >= p2StartDate && now <= p2EndDate;

			periods.push({
				startDate: p2StartDate,
				endDate: p2EndDate,
				payday: p2Payday,
				label: `${formatShortDate(p2StartDate)} - ${formatShortDate(p2EndDate)}`,
				isCurrent: p2IsCurrent
			});
		}
	}

	// Sort by start date and return requested count
	periods.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

	// Find current period index and return periods around it
	const currentIndex = periods.findIndex(p => p.isCurrent);
	if (currentIndex >= 0) {
		const start = Math.max(0, currentIndex - 2);
		return periods.slice(start, start + count);
	}

	return periods.slice(0, count);
}

function formatShortDate(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
