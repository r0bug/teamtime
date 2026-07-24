/**
 * Pay period service — the single source of truth for reading the
 * pay_period_config app setting and resolving the current pay period.
 *
 * Extracted from admin/schedule, admin/pay-periods and admin/timesheet, which
 * each carried their own copy of this logic (semi-monthly only, computed in
 * server-local time). This version resolves "today" in Pacific time like the
 * rest of the codebase, and returns period bounds as UTC instants of Pacific
 * midnight / end-of-day, ready for timestamptz queries.
 */

import { eq } from 'drizzle-orm';
import { db, appSettings } from '$lib/server/db';
import { getPacificDateParts, parsePacificDate, parsePacificEndOfDay } from '$lib/server/utils/timezone';

export interface PayPeriodConfig {
	type: 'semi-monthly' | 'bi-weekly' | 'weekly' | 'monthly';
	period1Start: number;
	period1End: number;
	period1Payday: number;
	period2Start: number;
	period2End: number;
	period2Payday: number;
}

export interface PayPeriod {
	startDate: Date; // UTC instant of Pacific midnight on the first day
	endDate: Date; // UTC instant of Pacific 23:59:59.999 on the last day
	label: string; // e.g. "Jul 11 – Jul 25"
	isCurrent: boolean;
}

export const DEFAULT_PAY_PERIOD_CONFIG: PayPeriodConfig = {
	type: 'semi-monthly',
	period1Start: 26,
	period1End: 10,
	period1Payday: 1,
	period2Start: 11,
	period2End: 25,
	period2Payday: 16
};

/** Read pay_period_config from app settings, falling back to the default. */
export async function getPayPeriodConfig(): Promise<PayPeriodConfig> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'pay_period_config'))
		.limit(1);
	if (setting) {
		try {
			return { ...DEFAULT_PAY_PERIOD_CONFIG, ...JSON.parse(setting.value) };
		} catch {
			// fall through to default
		}
	}
	return DEFAULT_PAY_PERIOD_CONFIG;
}

/** Calendar math with month rollover, as a Pacific YYYY-MM-DD string. */
function calendarDateStr(year: number, monthIndex: number, day: number): string {
	const d = new Date(year, monthIndex, day); // local Date used for calendar arithmetic only
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(date: Date): string {
	return date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });
}

/**
 * The pay period containing `now` (Pacific). Supports semi-monthly (the
 * configured/default type), weekly (Sun–Sat) and monthly. Returns null for
 * bi-weekly, which has no anchor date in the config and has never been
 * implemented anywhere in the app.
 */
export function getCurrentPayPeriod(config: PayPeriodConfig, now: Date = new Date()): PayPeriod | null {
	const p = getPacificDateParts(now);
	const year = p.year;
	const monthIndex = p.month - 1;
	const day = p.day;

	let startStr: string | null = null;
	let endStr: string | null = null;

	if (config.type === 'semi-monthly') {
		if (day >= config.period2Start && day <= config.period2End) {
			// e.g. the 11th–25th
			startStr = calendarDateStr(year, monthIndex, config.period2Start);
			endStr = calendarDateStr(year, monthIndex, config.period2End);
		} else if (day >= config.period1Start) {
			// e.g. the 26th onward — period runs into next month
			startStr = calendarDateStr(year, monthIndex, config.period1Start);
			endStr = calendarDateStr(year, monthIndex + 1, config.period1End);
		} else if (day <= config.period1End) {
			// e.g. the 1st–10th — period started last month
			startStr = calendarDateStr(year, monthIndex - 1, config.period1Start);
			endStr = calendarDateStr(year, monthIndex, config.period1End);
		}
	} else if (config.type === 'weekly') {
		startStr = calendarDateStr(year, monthIndex, day - p.weekday);
		endStr = calendarDateStr(year, monthIndex, day - p.weekday + 6);
	} else if (config.type === 'monthly') {
		startStr = calendarDateStr(year, monthIndex, 1);
		endStr = calendarDateStr(year, monthIndex + 1, 0);
	}

	if (!startStr || !endStr) return null;

	const startDate = parsePacificDate(startStr);
	const endDate = parsePacificEndOfDay(endStr);
	return {
		startDate,
		endDate,
		label: `${shortDate(startDate)} – ${shortDate(endDate)}`,
		isCurrent: true
	};
}
