/**
 * Attendance Policy Service
 *
 * Single switchboard for the automated attendance machinery: late-arrival
 * warnings, the overdue clock-out reminder, and the demerit engine that used
 * to escalate repeated warnings into formal infractions.
 *
 * As of 2026-10-01 the punitive half is OFF by default. The demerit engine and
 * late-arrival warnings are disabled, and an overdue clock-out gets exactly one
 * reminder SMS; if nothing changes within `autoCloseAfterNagMinutes` the entry
 * is closed at its scheduled shift end and the time entry is annotated to say
 * the system did it. Nobody is texted a warning and nobody loses points.
 *
 * Everything is stored as JSON in app_settings so it can be flipped back on
 * from /admin/demerits without a deploy.
 */

import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:attendance-policy');

export const ATTENDANCE_POLICY_KEY = 'attendance_policy_config';

export interface AttendancePolicyConfig {
	/** Escalate repeated warnings into demerits. Off: no demerit rows, no manager SMS. */
	demeritsEnabled: boolean;
	/** Detect late arrivals and text the employee about them. */
	lateArrivalWarningsEnabled: boolean;
	/** Send the single "you're still clocked in" reminder. */
	clockOutNagEnabled: boolean;
	/** Deduct points when an entry has to be auto-closed. */
	clockOutPointsPenaltyEnabled: boolean;
	/** Minutes past scheduled shift end before the one reminder goes out. */
	nagDelayMinutes: number;
	/**
	 * Minutes to wait after the reminder before closing the entry. The cron runs
	 * every 15 minutes, so the real-world delay is whichever is longer.
	 */
	autoCloseAfterNagMinutes: number;
	/**
	 * Hard backstop, in minutes past shift end. An entry is closed once it
	 * passes this even if the employee replied to the reminder, so nobody stays
	 * clocked in overnight because they texted back "still here".
	 */
	backstopMinutes: number;
}

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicyConfig = {
	demeritsEnabled: false,
	lateArrivalWarningsEnabled: false,
	clockOutNagEnabled: true,
	clockOutPointsPenaltyEnabled: false,
	nagDelayMinutes: 30,
	autoCloseAfterNagMinutes: 10,
	backstopMinutes: 180
};

export async function getAttendancePolicyConfig(): Promise<AttendancePolicyConfig> {
	try {
		const [row] = await db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, ATTENDANCE_POLICY_KEY))
			.limit(1);

		if (!row) return { ...DEFAULT_ATTENDANCE_POLICY };

		const parsed = JSON.parse(row.value) as Partial<AttendancePolicyConfig>;
		return { ...DEFAULT_ATTENDANCE_POLICY, ...parsed };
	} catch (err) {
		// A malformed or unreachable setting must never re-enable the punitive
		// machinery by accident — fall back to the (disabled) defaults.
		log.warn({ error: err }, 'Failed to load attendance policy config; using defaults');
		return { ...DEFAULT_ATTENDANCE_POLICY };
	}
}

export async function updateAttendancePolicyConfig(
	patch: Partial<AttendancePolicyConfig>
): Promise<AttendancePolicyConfig> {
	const current = await getAttendancePolicyConfig();
	const next: AttendancePolicyConfig = { ...current, ...patch };

	await db
		.insert(appSettings)
		.values({ key: ATTENDANCE_POLICY_KEY, value: JSON.stringify(next) })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: JSON.stringify(next), updatedAt: new Date() }
		});

	log.info({ patch, next }, 'Attendance policy updated');
	return next;
}
