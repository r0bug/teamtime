import { db, appSettings, breakEntries } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';

/**
 * Paid-break allowance configuration. Workers earn `minutesPer` paid break
 * minutes for every `perHours` worked. State minimum is 15 min per 4 hours;
 * break time beyond the allowance is unpaid and deducted from hours.
 *
 * Stored in `appSettings` under key `break_allowance_config`.
 */
export interface BreakAllowanceConfig {
	minutesPer: number;
	perHours: number;
}

export const BREAK_ALLOWANCE_KEY = 'break_allowance_config';
export const DEFAULT_BREAK_ALLOWANCE: BreakAllowanceConfig = { minutesPer: 15, perHours: 4 };

/** Load the paid-break allowance config from appSettings, falling back to the state minimum. */
export async function loadBreakAllowanceConfig(): Promise<BreakAllowanceConfig> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, BREAK_ALLOWANCE_KEY))
		.limit(1);

	if (setting) {
		try {
			const parsed = JSON.parse(setting.value);
			if (
				typeof parsed?.minutesPer === 'number' &&
				typeof parsed?.perHours === 'number' &&
				parsed.perHours > 0
			) {
				return { minutesPer: parsed.minutesPer, perHours: parsed.perHours };
			}
		} catch {
			/* fall through to default */
		}
	}
	return DEFAULT_BREAK_ALLOWANCE;
}

/**
 * Sum completed break minutes per time-entry id. Open breaks (no `breakEnd`)
 * are ignored — they are auto-closed at clock-out, so a finalized entry always
 * has complete breaks.
 */
export async function getBreakMinutesByEntry(entryIds: string[]): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (entryIds.length === 0) return map;

	const rows = await db
		.select({
			timeEntryId: breakEntries.timeEntryId,
			breakStart: breakEntries.breakStart,
			breakEnd: breakEntries.breakEnd
		})
		.from(breakEntries)
		.where(inArray(breakEntries.timeEntryId, entryIds));

	for (const b of rows) {
		if (b.breakStart && b.breakEnd) {
			const minutes = (b.breakEnd.getTime() - b.breakStart.getTime()) / 60000;
			map.set(b.timeEntryId, (map.get(b.timeEntryId) || 0) + minutes);
		}
	}
	return map;
}

export interface PaidHours {
	rawHours: number;
	breakMinutes: number;
	allowedBreakMinutes: number;
	excessBreakMinutes: number;
	/** rawHours minus the unpaid (excess) break time, never below 0. */
	paidHours: number;
}

/**
 * Apply the paid-break allowance to a single shift. Only break time beyond the
 * allowance (`minutesPer` per `perHours` worked) is unpaid and deducted.
 */
export function computePaidHours(
	rawHours: number,
	breakMinutes: number,
	config: BreakAllowanceConfig = DEFAULT_BREAK_ALLOWANCE
): PaidHours {
	const bm = Math.round(breakMinutes * 100) / 100;
	const allowedBreakMinutes =
		Math.round(rawHours * (config.minutesPer / config.perHours) * 100) / 100;
	const excessBreakMinutes = Math.max(0, Math.round((bm - allowedBreakMinutes) * 100) / 100);
	const paidHours = Math.max(0, Math.round((rawHours - excessBreakMinutes / 60) * 100) / 100);
	return { rawHours, breakMinutes: bm, allowedBreakMinutes, excessBreakMinutes, paidHours };
}

/**
 * Compute paid hours (break allowance applied) for a batch of time entries,
 * returning a Map of entryId → paid hours. Loads break minutes and config once.
 *
 * Entries without a clock-out are skipped unless `openShiftEnd` is supplied, in
 * which case that timestamp is used as the shift end (for live/in-progress
 * labor estimates).
 */
export async function paidHoursByEntry(
	entries: Array<{ id: string; clockIn: Date | string | null; clockOut: Date | string | null }>,
	opts?: { config?: BreakAllowanceConfig; openShiftEnd?: Date }
): Promise<Map<string, number>> {
	const config = opts?.config ?? (await loadBreakAllowanceConfig());
	const openEnd = opts?.openShiftEnd;

	const relevant = entries.filter((e) => e.id && e.clockIn && (e.clockOut || openEnd));
	const breakMap = await getBreakMinutesByEntry(relevant.map((e) => e.id));

	const result = new Map<string, number>();
	for (const e of relevant) {
		const end = e.clockOut ? new Date(e.clockOut) : openEnd!;
		const rawHours = (end.getTime() - new Date(e.clockIn!).getTime()) / 3600000;
		if (rawHours <= 0) continue;
		result.set(e.id, computePaidHours(rawHours, breakMap.get(e.id) ?? 0, config).paidHours);
	}
	return result;
}
