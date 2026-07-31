import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { toPacificDateString } from './timezone';

/**
 * Pay period configuration, stored in `appSettings` under key
 * `pay_period_config`. Only semi-monthly is implemented; the other types are
 * accepted in the admin UI but fall back to semi-monthly calculation.
 */
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

export const PAY_PERIOD_CONFIG_KEY = 'pay_period_config';

export const DEFAULT_PAY_PERIOD_CONFIG: PayPeriodConfig = {
	type: 'semi-monthly',
	period1Start: 26,
	period1End: 10,
	period1Payday: 1,
	period2Start: 11,
	period2End: 25,
	period2Payday: 16
};

/**
 * A pay period with all dates as Pacific-calendar `YYYY-MM-DD` strings.
 * Convert to query boundaries with `parsePacificDate(startDate)` /
 * `parsePacificEndOfDay(endDate)` — never `new Date(startDate)`, which parses
 * as UTC midnight and shifts the boundary 7-8 hours into the prior Pacific day.
 */
export interface PayPeriod {
	startDate: string;
	endDate: string;
	payday: string;
	label: string;
	isCurrent: boolean;
}

/** Load the pay period config from appSettings, falling back to the default. */
export async function loadPayPeriodConfig(): Promise<PayPeriodConfig> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, PAY_PERIOD_CONFIG_KEY))
		.limit(1);

	if (setting) {
		try {
			return JSON.parse(setting.value);
		} catch {
			/* fall through to default */
		}
	}
	return DEFAULT_PAY_PERIOD_CONFIG;
}

// Calendar-day math done in UTC purely to avoid DST edges; only the Y-M-D
// parts are ever used. Date.UTC also normalizes overflow (month -1, day 32).
function ymd(year: number, month: number, day: number): string {
	return new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];
}

/** Format a `YYYY-MM-DD` string as e.g. "Jul 11" without timezone shift. */
export function formatShortDate(dateStr: string): string {
	return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
		timeZone: 'UTC',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Calculate recent pay periods (newest first) around the current Pacific date.
 * `today` is an override for testing, as a `YYYY-MM-DD` Pacific date string.
 */
export function calculatePayPeriods(
	config: PayPeriodConfig,
	count: number,
	today: string = toPacificDateString(new Date())
): PayPeriod[] {
	const periods: PayPeriod[] = [];
	const [todayYear, todayMonth] = today.split('-').map(Number);

	// Semi-monthly is the only implemented type; others fall back to it.
	for (let monthOffset = -3; monthOffset <= 1; monthOffset++) {
		const year = todayYear;
		const month = todayMonth - 1 + monthOffset; // ymd() normalizes overflow

		// Period 1 (e.g., 26th–10th) may cross the month boundary
		const p1 = {
			startDate:
				config.period1Start > config.period1End
					? ymd(year, month - 1, config.period1Start)
					: ymd(year, month, config.period1Start),
			endDate: ymd(year, month, config.period1End),
			payday: ymd(year, month, config.period1Payday)
		};

		// Period 2 (e.g., 11th–25th) is within one month
		const p2 = {
			startDate: ymd(year, month, config.period2Start),
			endDate: ymd(year, month, config.period2End),
			payday: ymd(year, month, config.period2Payday)
		};

		for (const p of [p1, p2]) {
			periods.push({
				...p,
				label: `${formatShortDate(p.startDate)} - ${formatShortDate(p.endDate)}`,
				isCurrent: today >= p.startDate && today <= p.endDate
			});
		}
	}

	periods.sort((a, b) => b.startDate.localeCompare(a.startDate));
	return periods.slice(0, count);
}

/**
 * The most recently completed pay period — the default range for payroll
 * reports. Falls back to the newest available period if none has ended yet.
 */
export function lastCompletedPayPeriod(
	periods: PayPeriod[],
	today: string = toPacificDateString(new Date())
): PayPeriod | undefined {
	return periods.find((p) => p.endDate < today && !p.isCurrent) || periods[1] || periods[0];
}
