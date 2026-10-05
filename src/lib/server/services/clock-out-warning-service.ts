/**
 * Clock-Out Warning Service
 *
 * Handles the overdue clock-out reminder, auto clock-out, and
 * manager-initiated force clock-outs.
 *
 * Current policy (2026-10-01) — one nag, then close:
 *   1. `nagDelayMinutes` past scheduled shift end, send ONE reminder SMS.
 *   2. `autoCloseAfterNagMinutes` later, if the entry is still open and the
 *      employee hasn't texted back, set clock-out to the scheduled shift end
 *      and annotate the time entry so the timesheet says the system did it.
 *   3. A reply defers the close until the `backstopMinutes` hard stop, so
 *      nobody stays clocked in overnight because they answered "still here".
 *
 * Nothing here is punitive: no points are docked and the demerit engine is
 * off. See attendance-policy-service for the switches.
 *
 * The reminder deliberately asks people to clock out in the app rather than to
 * text a time back. Reply *content* is never parsed — shift-coverage owns the
 * bare "YES"/claim-code reply space, and a competing parser here would swallow
 * its claims. We only check whether any inbound text arrived.
 */

import {
	db,
	clockOutWarnings,
	demerits,
	users,
	timeEntries,
	shifts,
	appSettings,
	breakEntries,
	smsLogs
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, gt, gte, lte, isNull, count, desc } from 'drizzle-orm';
import { awardPoints, POINT_VALUES } from './points-service';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { notifyManagersOfPendingDemerit } from './demerit-review-service';
import { getAttendancePolicyConfig } from './attendance-policy-service';
import { getPacificDayBounds, toPacificTimeString } from '$lib/server/utils/timezone';
import type { ClockOutWarning, Demerit } from '$lib/server/db/schema';

const log = createLogger('services:clock-out-warning');

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CLOCK_OUT_WARNING_CONFIG = {
	WARNING_THRESHOLD_FOR_DEMERIT: 2,    // Number of warnings before demerit
	WARNING_LOOKBACK_DAYS: 30,           // Count warnings in this period
	DEMERIT_POINTS_DEDUCTED: 50,         // Points deducted for demerit
	DEMERIT_EXPIRY_DAYS: 90,             // Days until demerit expires
	GRACE_PERIOD_MINUTES: 30,            // Minutes after shift end before warning
	MAX_HOURS_CLOCKED_IN: 10             // Fallback for no scheduled shift
	// Nag timing and the auto-close backstop live in attendance-policy-service
	// so they can be tuned from the admin UI without a deploy.
};

// ============================================================================
// SMS MESSAGES
// ============================================================================

export const SMS_MESSAGES = {
	/**
	 * The single overdue-clock-out reminder. Phrased to steer people to the app:
	 * it must not invite a bare "YES" or a time, which shift-coverage claims own.
	 */
	clockOutNag: (shiftEndTime: Date, closeAfterMinutes: number) =>
		`You're still clocked in from your shift that ended at ${toPacificTimeString(shiftEndTime)}. ` +
		`Please clock out in the app. If nothing changes in ${closeAfterMinutes} min we'll close it at ${toPacificTimeString(shiftEndTime)} for you.`,
	forceClockout: (managerName: string) =>
		`${managerName} has clocked you out. Please remember to clock out at the end of your shift.`
};

// ============================================================================
// WARNING FUNCTIONS
// ============================================================================

/**
 * Get the count of warnings for a user in the lookback period
 */
export async function getWarningCount(
	userId: string,
	lookbackDays: number = CLOCK_OUT_WARNING_CONFIG.WARNING_LOOKBACK_DAYS
): Promise<number> {
	const lookbackDate = new Date();
	lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

	const [result] = await db
		.select({ count: count() })
		.from(clockOutWarnings)
		.where(
			and(
				eq(clockOutWarnings.userId, userId),
				gte(clockOutWarnings.createdAt, lookbackDate)
			)
		);

	return result?.count ?? 0;
}

/**
 * The reminder row for a time entry, if one has already been sent. Its
 * createdAt is the clock the auto-close window runs against, and its presence
 * is the idempotency guard that keeps one overdue entry to one reminder.
 *
 * Takes the oldest row rather than the newest: if a bug ever wrote two, the
 * first one is the real reminder and the window should not keep sliding.
 */
export async function getNagForEntry(timeEntryId: string): Promise<ClockOutWarning | null> {
	const [warning] = await db
		.select()
		.from(clockOutWarnings)
		.where(
			and(
				eq(clockOutWarnings.timeEntryId, timeEntryId),
				eq(clockOutWarnings.warningType, 'auto_reminder')
			)
		)
		.orderBy(clockOutWarnings.createdAt)
		.limit(1);

	return warning ?? null;
}

/**
 * Did this person text us back after the reminder went out?
 *
 * Any inbound message counts. We never look at what it says: shift-coverage
 * owns the "YES"/claim-code reply space and a second parser here would steal
 * its claims. The point is only to tell "ignored the reminder" from "answered
 * it", so a human can sort out the rest.
 */
export async function findReplySince(
	userId: string,
	since: Date
): Promise<{ body: string | null; createdAt: Date } | null> {
	const [row] = await db
		.select({ body: smsLogs.body, createdAt: smsLogs.createdAt })
		.from(smsLogs)
		.where(
			and(
				eq(smsLogs.userId, userId),
				eq(smsLogs.direction, 'inbound'),
				gt(smsLogs.createdAt, since)
			)
		)
		.orderBy(smsLogs.createdAt)
		.limit(1);

	return row ?? null;
}

/**
 * Create a clock-out warning record
 */
export async function createWarning(params: {
	userId: string;
	timeEntryId: string;
	warningType: 'auto_reminder' | 'force_clockout';
	issuedBy?: string;
	shiftEndTime?: Date;
	minutesPastShiftEnd?: number;
	reason?: string;
	smsResult?: { success: boolean; sid?: string; error?: string };
}): Promise<ClockOutWarning> {
	const [warning] = await db
		.insert(clockOutWarnings)
		.values({
			userId: params.userId,
			timeEntryId: params.timeEntryId,
			warningType: params.warningType,
			issuedBy: params.issuedBy ?? null,
			shiftEndTime: params.shiftEndTime ?? null,
			minutesPastShiftEnd: params.minutesPastShiftEnd ?? null,
			reason: params.reason ?? null,
			smsResult: params.smsResult ?? null,
			escalatedToDemerit: false,
			demeritId: null
		})
		.returning();

	log.info(
		{
			userId: params.userId,
			timeEntryId: params.timeEntryId,
			warningType: params.warningType,
			warningId: warning.id
		},
		'Clock-out warning created'
	);

	return warning;
}

// ============================================================================
// DEMERIT FUNCTIONS
// ============================================================================

/**
 * Get active demerits for a user
 */
export async function getActiveDemerits(userId: string): Promise<Demerit[]> {
	const now = new Date();

	return db
		.select()
		.from(demerits)
		.where(
			and(
				eq(demerits.userId, userId),
				eq(demerits.status, 'active')
			)
		)
		.orderBy(desc(demerits.createdAt));
}

/**
 * Check if user should receive a demerit and create one if needed
 * Returns the demerit if created, null otherwise
 */
export async function checkAndEscalateToDemerit(
	userId: string,
	warningId: string,
	issuedBy: string
): Promise<Demerit | null> {
	// Kill switch: when the demerit engine is off, repeated warnings never
	// become infractions and managers are not paged about them.
	const policy = await getAttendancePolicyConfig();
	if (!policy.demeritsEnabled) {
		log.debug({ userId, warningId }, 'Demerit engine disabled — skipping clock-out escalation');
		return null;
	}

	// Count warnings in lookback period
	const warningCount = await getWarningCount(userId);

	log.info(
		{ userId, warningCount, threshold: CLOCK_OUT_WARNING_CONFIG.WARNING_THRESHOLD_FOR_DEMERIT },
		'Checking demerit escalation'
	);

	// Check if threshold reached
	if (warningCount < CLOCK_OUT_WARNING_CONFIG.WARNING_THRESHOLD_FOR_DEMERIT) {
		return null;
	}

	// Count existing demerits of this type in the lookback period to prevent
	// firing on every warning past threshold (2 warnings = 1 demerit, 4 = 2, etc.)
	const lookbackDate = new Date();
	lookbackDate.setDate(lookbackDate.getDate() - CLOCK_OUT_WARNING_CONFIG.WARNING_LOOKBACK_DAYS);

	const [demeritResult] = await db
		.select({ count: count() })
		.from(demerits)
		.where(
			and(
				eq(demerits.userId, userId),
				eq(demerits.type, 'clock_out_violation'),
				gte(demerits.createdAt, lookbackDate)
			)
		);

	const existingDemeritCount = demeritResult?.count ?? 0;
	const threshold = CLOCK_OUT_WARNING_CONFIG.WARNING_THRESHOLD_FOR_DEMERIT;

	if (warningCount < threshold * (existingDemeritCount + 1)) {
		log.info(
			{ userId, warningCount, existingDemeritCount, nextDemeritAt: threshold * (existingDemeritCount + 1) },
			'Demerit already issued for current warning batch, skipping'
		);
		return null;
	}

	// Get user info for the manager notification
	const [user] = await db
		.select({ id: users.id, name: users.name, phone: users.phone })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		log.error({ userId }, 'User not found when creating demerit');
		return null;
	}

	// Calculate expiry date
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + CLOCK_OUT_WARNING_CONFIG.DEMERIT_EXPIRY_DAYS);

	// Create the demerit as PENDING: no points deducted and no SMS to the
	// employee until a manager approves it at /admin/demerits.
	const [demerit] = await db
		.insert(demerits)
		.values({
			userId,
			type: 'clock_out_violation',
			status: 'pending',
			issuedBy,
			title: 'Repeated Clock-Out Violations',
			description: `Received ${warningCount} clock-out warnings within ${CLOCK_OUT_WARNING_CONFIG.WARNING_LOOKBACK_DAYS} days. Auto-detected, awaiting manager review.`,
			pointsDeducted: CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED,
			smsNotified: false,
			expiresAt
		})
		.returning();

	log.info(
		{ userId, demeritId: demerit.id, warningCount },
		'Pending demerit created for repeated clock-out violations, awaiting manager review'
	);

	// Update warning to reference demerit
	await db
		.update(clockOutWarnings)
		.set({
			escalatedToDemerit: true,
			demeritId: demerit.id
		})
		.where(eq(clockOutWarnings.id, warningId));

	await notifyManagersOfPendingDemerit(demerit, user.name);

	return demerit;
}

// ============================================================================
// FORCE CLOCK-OUT FUNCTION
// ============================================================================

export interface ForceClockOutResult {
	success: boolean;
	timeEntry?: {
		id: string;
		clockIn: Date;
		clockOut: Date;
	};
	warning?: ClockOutWarning;
	demerit?: Demerit | null;
	smsResult?: { success: boolean; sid?: string; error?: string };
	pointsDeducted: number;
	error?: string;
}

/**
 * Force clock out a user - called by manager/admin
 */
export async function forceClockOut(
	targetUserId: string,
	issuedByUserId: string,
	reason?: string
): Promise<ForceClockOutResult> {
	// Prevent self force-out
	if (targetUserId === issuedByUserId) {
		return { success: false, pointsDeducted: 0, error: 'Cannot force your own clock-out' };
	}

	// Find active time entry
	const [activeEntry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(
				eq(timeEntries.userId, targetUserId),
				isNull(timeEntries.clockOut)
			)
		)
		.limit(1);

	if (!activeEntry) {
		return { success: false, pointsDeducted: 0, error: 'User is not clocked in' };
	}

	// Get both users' info
	const [targetUser] = await db
		.select({ id: users.id, name: users.name, phone: users.phone })
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);

	const [issuerUser] = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, issuedByUserId))
		.limit(1);

	if (!targetUser) {
		return { success: false, pointsDeducted: 0, error: 'Target user not found' };
	}

	const now = new Date();

	// Auto-end any active break before clocking out
	const [activeBreak] = await db
		.select()
		.from(breakEntries)
		.where(
			and(
				eq(breakEntries.timeEntryId, activeEntry.id),
				isNull(breakEntries.breakEnd)
			)
		)
		.limit(1);

	if (activeBreak) {
		await db
			.update(breakEntries)
			.set({ breakEnd: now })
			.where(eq(breakEntries.id, activeBreak.id));
	}

	// Clock out the user
	const [updatedEntry] = await db
		.update(timeEntries)
		.set({
			clockOut: now,
			updatedAt: now,
			updatedBy: issuedByUserId
		})
		.where(eq(timeEntries.id, activeEntry.id))
		.returning();

	// Send SMS notification
	let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
	if (targetUser.phone) {
		const formatted = formatPhoneToE164(targetUser.phone);
		if (formatted) {
			const message = SMS_MESSAGES.forceClockout(issuerUser?.name ?? 'A manager');
			smsResult = await sendSMS(formatted, message, { sentByUserId: issuedByUserId });
		}
	}

	// Create warning record
	const warning = await createWarning({
		userId: targetUserId,
		timeEntryId: activeEntry.id,
		warningType: 'force_clockout',
		issuedBy: issuedByUserId,
		reason,
		smsResult
	});

	// Award negative points
	let pointsDeducted = Math.abs(POINT_VALUES.CLOCK_OUT_FORGOTTEN);
	try {
		await awardPoints({
			userId: targetUserId,
			basePoints: POINT_VALUES.CLOCK_OUT_FORGOTTEN,
			category: 'attendance',
			action: 'clock_out_forgotten',
			description: 'Forgot to clock out (forced by manager)',
			sourceType: 'time_entry',
			sourceId: activeEntry.id,
			metadata: { forcedBy: issuedByUserId, reason }
		});
	} catch (err) {
		log.error({ error: err }, 'Failed to deduct points for force clock-out');
		pointsDeducted = 0;
	}

	// Check for demerit escalation
	const demerit = await checkAndEscalateToDemerit(targetUserId, warning.id, issuedByUserId);
	if (demerit) {
		pointsDeducted += CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED;
	}

	log.info(
		{
			targetUserId,
			issuedBy: issuedByUserId,
			timeEntryId: activeEntry.id,
			warningId: warning.id,
			demeritIssued: !!demerit,
			pointsDeducted
		},
		'Force clock-out completed'
	);

	return {
		success: true,
		timeEntry: {
			id: updatedEntry.id,
			clockIn: new Date(updatedEntry.clockIn),
			clockOut: now
		},
		warning,
		demerit,
		smsResult,
		pointsDeducted
	};
}

// ============================================================================
// CONFIG LOADING
// ============================================================================

/**
 * Load clock-out config from appSettings with fallback to hardcoded defaults
 */
export async function loadClockOutConfig(): Promise<{ gracePeriodMinutes: number; maxHoursClockedIn: number }> {
	try {
		const [setting] = await db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, 'clock_out_grace_period_minutes'))
			.limit(1);

		const gracePeriodMinutes = setting ? parseInt(setting.value, 10) : CLOCK_OUT_WARNING_CONFIG.GRACE_PERIOD_MINUTES;

		return {
			gracePeriodMinutes: isNaN(gracePeriodMinutes) ? CLOCK_OUT_WARNING_CONFIG.GRACE_PERIOD_MINUTES : gracePeriodMinutes,
			maxHoursClockedIn: CLOCK_OUT_WARNING_CONFIG.MAX_HOURS_CLOCKED_IN
		};
	} catch (err) {
		log.warn({ error: err }, 'Failed to load clock-out config from appSettings, using defaults');
		return {
			gracePeriodMinutes: CLOCK_OUT_WARNING_CONFIG.GRACE_PERIOD_MINUTES,
			maxHoursClockedIn: CLOCK_OUT_WARNING_CONFIG.MAX_HOURS_CLOCKED_IN
		};
	}
}

// ============================================================================
// CRON CHECK FUNCTION
// ============================================================================


export interface CronCheckResult {
	checked: number;
	/** Reminders sent this pass. */
	nagged: number;
	/** Warning rows written this pass. Same events as `nagged`; kept for callers. */
	warned: number;
	skipped: number;
	/** Entries left open because the employee texted back and the backstop is not up. */
	deferred: number;
	errors: string[];
	demeritsIssued: number;
	autoClockOuts: number;
}

/** Cap stored reply text so one long SMS can't bloat the warning row. */
const MAX_STORED_REPLY_CHARS = 500;

/**
 * Build the timesheet annotation for an auto-closed entry. It has to read
 * clearly to whoever approves payroll, and say plainly that the system — not
 * the employee and not a manager — set this clock-out.
 */
export function buildAutoCloseNote(params: {
	shiftEndTime: Date;
	/** Where the clock-out actually landed — shift end, or last contact. */
	closeAt: Date;
	minutesPastShiftEnd: number;
	nagSentAt: Date;
	repliedAt: Date | null;
	/** False when the reminder SMS never actually went out. */
	wasWarned: boolean;
	/** Set when the employee gave a business reason for the overtime. */
	justifiedReason: string | null;
}): string {
	const closedAt = toPacificTimeString(params.closeAt);

	// Justified overtime is closed at last contact, not shift end, so the note
	// has to say which it was and that the real end still needs confirming —
	// payroll reads this when someone disputes their hours.
	if (params.justifiedReason) {
		return (
			`[Office Manager] Auto clocked out at ${closedAt} — last contact, NOT the scheduled ` +
			`shift end of ${toPacificTimeString(params.shiftEndTime)}. Reported working late: ` +
			`${params.justifiedReason} A manager was notified at the time. ` +
			`Confirm the real finish time with the employee before approving.`
		);
	}

	// Never claim we texted someone when we didn't.
	const outcome = !params.wasWarned
		? 'no reminder could be sent (no phone on file or SMS failed)'
		: params.repliedAt
			? `reminder texted ${toPacificTimeString(params.nagSentAt)}, replied ${toPacificTimeString(params.repliedAt)} but was still clocked in at the cutoff`
			: `reminder texted ${toPacificTimeString(params.nagSentAt)}, no reply`;

	return (
		`[Office Manager] Auto clocked out at ${closedAt} (scheduled shift end). ` +
		`Still clocked in ${Math.floor(params.minutesPastShiftEnd)} min past shift end; ` +
		`${outcome}. Edit this entry if the real time differs.`
	);
}

/** The later of two instants. */
function laterOf(a: Date, b: Date): Date {
	return a.getTime() >= b.getTime() ? a : b;
}

/** Append to a time entry's existing notes without clobbering them. */
export function appendNote(existing: string | null, addition: string): string {
	const trimmed = (existing ?? '').trim();
	return trimmed ? `${trimmed}\n${addition}` : addition;
}

/**
 * Check for overdue clock-outs: send the one reminder, then close the entry.
 * Called by cron every 15 minutes.
 *
 * Pass 1 for an entry sends the reminder. A later pass — at least
 * `autoCloseAfterNagMinutes` after that, so in practice the next 15-minute
 * run — closes it at the scheduled shift end unless the employee has texted
 * back. The clock-out time is the shift end, never "now", so a forgotten
 * clock-out can't inflate someone's hours.
 */
export async function checkOverdueClockOuts(systemUserId: string): Promise<CronCheckResult> {
	const result: CronCheckResult = {
		checked: 0,
		nagged: 0,
		warned: 0,
		skipped: 0,
		deferred: 0,
		errors: [],
		demeritsIssued: 0,
		autoClockOuts: 0
	};

	const now = new Date();
	const config = await loadClockOutConfig();
	const policy = await getAttendancePolicyConfig();

	// Find all active time entries (not clocked out)
	const activeEntries = await db
		.select({
			timeEntry: timeEntries,
			user: {
				id: users.id,
				name: users.name,
				phone: users.phone
			}
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				isNull(timeEntries.clockOut),
				eq(users.isActive, true)
			)
		);

	log.info({ activeEntriesCount: activeEntries.length }, 'Checking overdue clock-outs');

	for (const { timeEntry, user } of activeEntries) {
		result.checked++;

		try {
			const clockInTime = new Date(timeEntry.clockIn);
			const hoursClocked = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

			let shiftEndTime: Date | undefined;
			let hasShift = false;

			// Look up the shift that matches this clock-in time
			// Search for shifts that started within 2 hours before/after the clock-in
			const shiftSearchStart = new Date(clockInTime.getTime() - 2 * 60 * 60 * 1000);
			const shiftSearchEnd = new Date(clockInTime.getTime() + 2 * 60 * 60 * 1000);

			let [userShift] = await db
				.select({ startTime: shifts.startTime, endTime: shifts.endTime })
				.from(shifts)
				.where(
					and(
						eq(shifts.userId, user.id),
						gte(shifts.startTime, shiftSearchStart),
						lte(shifts.startTime, shiftSearchEnd)
					)
				)
				.orderBy(desc(shifts.endTime))
				.limit(1);

			// Fallback: if the ±2hr window missed (user clocked in very early/late),
			// find the nearest shift for this user on the same Pacific calendar day
			// as their clock-in. This prevents premature synthetic-shift-end closes
			// for edge-case clock-ins that still correspond to a real shift.
			if (!userShift) {
				const { start: dayStart, end: dayEnd } = getPacificDayBounds(clockInTime);
				const dayShifts = await db
					.select({ startTime: shifts.startTime, endTime: shifts.endTime })
					.from(shifts)
					.where(
						and(
							eq(shifts.userId, user.id),
							gte(shifts.startTime, dayStart),
							lte(shifts.startTime, dayEnd)
						)
					);
				if (dayShifts.length > 0) {
					// Pick the shift whose startTime is closest to the actual clock-in
					userShift = dayShifts.reduce((nearest, s) => {
						const nearestDiff = Math.abs(new Date(nearest.startTime).getTime() - clockInTime.getTime());
						const currentDiff = Math.abs(new Date(s.startTime).getTime() - clockInTime.getTime());
						return currentDiff < nearestDiff ? s : nearest;
					});
				}
			}

			if (userShift) {
				hasShift = true;
				shiftEndTime = new Date(userShift.endTime);
			} else {
				// Fallback: no shift scheduled at all — use clockIn + maxHoursClockedIn
				// as the synthetic shift end so the reminder has something to cite.
				if (hoursClocked >= config.maxHoursClockedIn) {
					shiftEndTime = new Date(clockInTime.getTime() + config.maxHoursClockedIn * 60 * 60 * 1000);
				}
			}

			// Not past any threshold yet
			if (!shiftEndTime) {
				result.skipped++;
				continue;
			}

			const minutesPastShiftEnd = (now.getTime() - shiftEndTime.getTime()) / 60000;
			const nag = await getNagForEntry(timeEntry.id);

			// ---- Stage 1: the single reminder ----
			if (!nag) {
				if (minutesPastShiftEnd < policy.nagDelayMinutes) {
					result.skipped++;
					continue;
				}

				let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
				if (policy.clockOutNagEnabled && user.phone) {
					const formatted = formatPhoneToE164(user.phone);
					if (formatted) {
						smsResult = await sendSMS(
							formatted,
							SMS_MESSAGES.clockOutNag(shiftEndTime, policy.autoCloseAfterNagMinutes)
						);
					}
				}

				// Record the reminder even when no SMS went out (no phone on file,
				// nag switched off, Twilio down). Its timestamp is what the
				// auto-close window is measured from, so it must always exist.
				await createWarning({
					userId: user.id,
					timeEntryId: timeEntry.id,
					warningType: 'auto_reminder',
					shiftEndTime,
					minutesPastShiftEnd: Math.floor(minutesPastShiftEnd),
					reason: `Clock-out reminder ${Math.floor(minutesPastShiftEnd)} min past shift end`,
					smsResult
				});

				result.nagged++;
				result.warned++;

				log.info(
					{
						userId: user.id,
						timeEntryId: timeEntry.id,
						minutesPastShiftEnd: Math.floor(minutesPastShiftEnd),
						smsSent: smsResult?.success ?? false
					},
					'Clock-out reminder sent'
				);

				// Give them the window — the close happens on a later pass.
				continue;
			}

			// ---- Stage 2: close it at shift end ----
			const nagSentAt = new Date(nag.createdAt);
			const minutesSinceNag = (now.getTime() - nagSentAt.getTime()) / 60000;
			const pastBackstop = minutesPastShiftEnd >= policy.backstopMinutes;

			// The short window is only fair if the reminder actually reached them.
			// When it didn't — no phone on file, reminder switched off, Twilio
			// down — closing someone's entry 10 minutes later with no warning is
			// not defensible, so those fall through to the backstop instead.
			const wasWarned = nag.smsResult?.success === true;
			const waitedLongEnough = wasWarned
				? minutesSinceNag >= policy.autoCloseAfterNagMinutes
				: pastBackstop;

			if (!waitedLongEnough) {
				result.skipped++;
				continue;
			}

			// "No response or change": the entry is still open (it matched this
			// query), so all that's left to check is whether they texted back.
			const reply = nag.repliedAt
				? { body: nag.userReply, createdAt: new Date(nag.repliedAt) }
				: await findReplySince(user.id, nagSentAt);

			if (reply && !nag.repliedAt) {
				await db
					.update(clockOutWarnings)
					.set({
						userReply: reply.body ? reply.body.slice(0, MAX_STORED_REPLY_CHARS) : null,
						repliedAt: reply.createdAt
					})
					.where(eq(clockOutWarnings.id, nag.id));
			}

			// A reply buys time but not a free pass — the backstop still closes
			// the entry so nobody is left clocked in overnight.
			if (reply && !pastBackstop) {
				result.deferred++;
				log.info(
					{ userId: user.id, timeEntryId: timeEntry.id },
					'Employee replied to clock-out reminder — deferring auto-close to backstop'
				);
				continue;
			}

			// Overtime the shop asked for must not be closed at the scheduled
			// shift end — that erases hours they actually worked. The last moment
			// we have evidence they were working is their reply, so close there
			// and say on the entry that the real end needs confirming. A manager
			// was already texted when the reply came in (clock-out-reply-service),
			// so they have had the whole backstop window to correct it properly.
			const justified = nag.replyAnalysis?.justified === true;
			const closeAt = justified && reply ? laterOf(reply.createdAt, shiftEndTime) : shiftEndTime;

			// Auto-end any active break before clocking out
			const [activeBreakEntry] = await db
				.select()
				.from(breakEntries)
				.where(
					and(
						eq(breakEntries.timeEntryId, timeEntry.id),
						isNull(breakEntries.breakEnd)
					)
				)
				.limit(1);

			if (activeBreakEntry) {
				await db
					.update(breakEntries)
					.set({ breakEnd: closeAt })
					.where(eq(breakEntries.id, activeBreakEntry.id));
			}

			// Clock out at the scheduled shift end (not "now"), so a forgotten
			// clock-out can't inflate hours — unless the overtime was justified,
			// in which case closeAt is their last contact. Either way the entry
			// says the system did it.
			await db
				.update(timeEntries)
				.set({
					clockOut: closeAt,
					notes: appendNote(
						timeEntry.notes,
						buildAutoCloseNote({
							shiftEndTime,
							closeAt,
							minutesPastShiftEnd,
							nagSentAt,
							repliedAt: reply ? reply.createdAt : null,
							wasWarned,
							justifiedReason: justified ? (nag.replyAnalysis?.reason ?? null) : null
						})
					),
					updatedAt: now,
					updatedBy: systemUserId
				})
				.where(eq(timeEntries.id, timeEntry.id));

			result.autoClockOuts++;

			// Points penalty is off under the current policy; the switch is kept
			// so docking can be restored without touching this function.
			if (policy.clockOutPointsPenaltyEnabled) {
				try {
					await awardPoints({
						userId: user.id,
						basePoints: POINT_VALUES.CLOCK_OUT_FORGOTTEN,
						category: 'attendance',
						action: 'clock_out_forgotten',
						description: 'Forgot to clock out (auto clock-out at shift end)',
						sourceType: 'time_entry',
						sourceId: timeEntry.id,
						metadata: { autoClockOut: true }
					});
				} catch (err) {
					log.error({ error: err, timeEntryId: timeEntry.id }, 'Failed to deduct points for auto clock-out');
				}
			}

			// No-op while the demerit engine is off; self-gates internally.
			const demerit = await checkAndEscalateToDemerit(user.id, nag.id, systemUserId);
			if (demerit) {
				result.demeritsIssued++;
			}

			log.info(
				{
					userId: user.id,
					timeEntryId: timeEntry.id,
					hoursClocked: hoursClocked.toFixed(1),
					hasShift,
					minutesPastShiftEnd: Math.floor(minutesPastShiftEnd),
					clockOutTime: shiftEndTime.toISOString(),
					replied: !!reply,
					viaBackstop: pastBackstop
				},
				'Auto clock-out executed at shift end time'
			);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			result.errors.push(`User ${user.id}: ${errorMsg}`);
			log.error({ error: err, userId: user.id }, 'Error processing overdue clock-out');
		}
	}

	log.info(result, 'Overdue clock-out check completed');
	return result;
}
