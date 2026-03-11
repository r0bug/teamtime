/**
 * Clock-Out Warning Service
 *
 * Handles clock-out warnings, demerit escalation, and related notifications.
 * Implements the policy: 2 warnings in 30 days = automatic demerit.
 */

import {
	db,
	clockOutWarnings,
	demerits,
	users,
	timeEntries,
	shifts,
	appSettings
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, gte, lte, isNull, count, desc } from 'drizzle-orm';
import { awardPoints, POINT_VALUES } from './points-service';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { toPacificTimeString } from '$lib/server/utils/timezone';
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
	MAX_HOURS_CLOCKED_IN: 10,            // Fallback for no scheduled shift
	// Escalation intervals (minutes past shift end)
	NAG_1_MINUTES: 30,                   // Friendly reminder
	NAG_2_MINUTES: 90,                   // Firmer warning
	NAG_3_MINUTES: 180                   // Auto clock-out at shift end
};

// ============================================================================
// SMS MESSAGES
// ============================================================================

export const SMS_MESSAGES = {
	nag1: (shiftEndTime: Date) =>
		`Your shift ended at ${toPacificTimeString(shiftEndTime)}. Still working? Reply YES to clock out now, or reply with your actual clock-out time (e.g. "5:15 PM").`,
	nag2: (shiftEndTime: Date, minutesPast: number) =>
		`You're still clocked in ${Math.round(minutesPast / 60)} hrs past your shift. Reply with your clock-out time or YES to clock out now. No reply = auto clock-out at shift end.`,
	nag3: (shiftEndTime: Date) =>
		`Auto-clocking you out at ${toPacificTimeString(shiftEndTime)} (shift end). Reply with your actual clock-out time if different.`,
	autoReminder: 'Reminder: You are still clocked in. Please clock out at the end of your shift.',
	forceClockout: (managerName: string) =>
		`${managerName} has clocked you out. Please remember to clock out at the end of your shift.`,
	demeritIssued: (warningCount: number) =>
		`You have received a demerit for repeated clock-out violations (${warningCount} warnings in 30 days). ${CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED} points have been deducted.`,
	timeConfirmed: (time: string) =>
		`Got it — clocked you out at ${time}. Thanks!`,
	timeParseError: 'Sorry, couldn\'t understand that time. Reply with a time like "5:30 PM" or "17:30", or YES to clock out now.',
	timeUpdated: (time: string) =>
		`Got it — updated your clock-out to ${time}.`,
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
 * Get the number of nag warnings (auto_reminder type) sent for a specific time entry.
 * Used to determine escalation level.
 */
export async function getNagCountForEntry(timeEntryId: string): Promise<number> {
	const [result] = await db
		.select({ count: count() })
		.from(clockOutWarnings)
		.where(
			and(
				eq(clockOutWarnings.timeEntryId, timeEntryId),
				eq(clockOutWarnings.warningType, 'auto_reminder')
			)
		);
	return result?.count ?? 0;
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

	// Get user info for SMS
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

	// Create demerit
	const [demerit] = await db
		.insert(demerits)
		.values({
			userId,
			type: 'clock_out_violation',
			status: 'active',
			issuedBy,
			title: 'Repeated Clock-Out Violations',
			description: `Received ${warningCount} clock-out warnings within ${CLOCK_OUT_WARNING_CONFIG.WARNING_LOOKBACK_DAYS} days. Automatic demerit issued per policy.`,
			pointsDeducted: CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED,
			smsNotified: false,
			expiresAt
		})
		.returning();

	log.info(
		{
			userId,
			demeritId: demerit.id,
			warningCount,
			pointsDeducted: CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED
		},
		'Demerit created for repeated clock-out violations'
	);

	// Update warning to reference demerit
	await db
		.update(clockOutWarnings)
		.set({
			escalatedToDemerit: true,
			demeritId: demerit.id
		})
		.where(eq(clockOutWarnings.id, warningId));

	// Deduct points
	try {
		await awardPoints({
			userId,
			basePoints: -CLOCK_OUT_WARNING_CONFIG.DEMERIT_POINTS_DEDUCTED,
			category: 'attendance',
			action: 'demerit_clock_out_violation',
			description: `Demerit issued: ${warningCount} clock-out violations in ${CLOCK_OUT_WARNING_CONFIG.WARNING_LOOKBACK_DAYS} days`,
			sourceType: 'demerit',
			sourceId: demerit.id,
			metadata: { warningCount, demeritId: demerit.id }
		});
	} catch (err) {
		log.error({ error: err, demeritId: demerit.id }, 'Failed to deduct points for demerit');
	}

	// Send SMS notification
	let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
	if (user.phone) {
		const formatted = formatPhoneToE164(user.phone);
		if (formatted) {
			smsResult = await sendSMS(formatted, SMS_MESSAGES.demeritIssued(warningCount));
		}
	}

	// Update demerit with SMS result
	if (smsResult) {
		await db
			.update(demerits)
			.set({
				smsNotified: smsResult.success,
				smsResult
			})
			.where(eq(demerits.id, demerit.id));
	}

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
			smsResult = await sendSMS(formatted, message);
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
	warned: number;
	skipped: number;
	errors: string[];
	demeritsIssued: number;
	autoClockOuts: number;
}

/**
 * Check for overdue clock-outs and send escalating reminders
 * Called by cron every 15 minutes
 *
 * Escalation levels:
 *   Nag 1 (NAG_1_MINUTES past shift end): Friendly reminder
 *   Nag 2 (NAG_2_MINUTES past shift end): Firmer warning with auto clock-out threat
 *   Nag 3 (NAG_3_MINUTES past shift end): Auto clock-out at shift end time + demerit check
 */
export async function checkOverdueClockOuts(systemUserId: string): Promise<CronCheckResult> {
	const result: CronCheckResult = {
		checked: 0,
		warned: 0,
		skipped: 0,
		errors: [],
		demeritsIssued: 0,
		autoClockOuts: 0
	};

	const now = new Date();
	const config = await loadClockOutConfig();

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

	// Get today's date boundaries for shift lookup
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);
	const todayEnd = new Date(now);
	todayEnd.setHours(23, 59, 59, 999);

	for (const { timeEntry, user } of activeEntries) {
		result.checked++;

		try {
			const clockInTime = new Date(timeEntry.clockIn);
			const hoursClocked = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

			let shiftEndTime: Date | undefined;
			let hasShift = false;

			// Look up today's shift for this user
			const [userShift] = await db
				.select({ endTime: shifts.endTime })
				.from(shifts)
				.where(
					and(
						eq(shifts.userId, user.id),
						gte(shifts.startTime, todayStart),
						lte(shifts.startTime, todayEnd)
					)
				)
				.orderBy(desc(shifts.endTime))
				.limit(1);

			if (userShift) {
				hasShift = true;
				shiftEndTime = new Date(userShift.endTime);
			} else {
				// Fallback: no shift scheduled, use clockIn + 8 hours as synthetic shift end
				if (hoursClocked >= config.maxHoursClockedIn) {
					shiftEndTime = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000);
				}
			}

			// Not past any threshold yet
			if (!shiftEndTime) {
				result.skipped++;
				continue;
			}

			const minutesPastShiftEnd = (now.getTime() - shiftEndTime.getTime()) / 60000;

			// Not past the first nag threshold yet
			if (minutesPastShiftEnd < CLOCK_OUT_WARNING_CONFIG.NAG_1_MINUTES) {
				result.skipped++;
				continue;
			}

			// Get how many nags we've already sent for this entry
			const nagCount = await getNagCountForEntry(timeEntry.id);

			let message: string | undefined;
			let shouldAutoClockOut = false;

			if (nagCount === 0 && minutesPastShiftEnd >= CLOCK_OUT_WARNING_CONFIG.NAG_1_MINUTES) {
				// Nag 1: Friendly reminder
				message = hasShift && shiftEndTime
					? SMS_MESSAGES.nag1(shiftEndTime)
					: SMS_MESSAGES.autoReminder;
			} else if (nagCount === 1 && minutesPastShiftEnd >= CLOCK_OUT_WARNING_CONFIG.NAG_2_MINUTES) {
				// Nag 2: Firmer warning
				message = SMS_MESSAGES.nag2(shiftEndTime, minutesPastShiftEnd);
			} else if (nagCount >= 2 && minutesPastShiftEnd >= CLOCK_OUT_WARNING_CONFIG.NAG_3_MINUTES) {
				// Nag 3: Auto clock-out
				message = SMS_MESSAGES.nag3(shiftEndTime);
				shouldAutoClockOut = true;
			} else {
				// Not time for the next nag yet
				result.skipped++;
				continue;
			}

			// Send SMS
			let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
			if (user.phone && message) {
				const formatted = formatPhoneToE164(user.phone);
				if (formatted) {
					smsResult = await sendSMS(formatted, message);
				}
			}

			// Create warning record
			const warning = await createWarning({
				userId: user.id,
				timeEntryId: timeEntry.id,
				warningType: 'auto_reminder',
				shiftEndTime,
				minutesPastShiftEnd: Math.floor(minutesPastShiftEnd),
				reason: `Escalation nag ${nagCount + 1}`,
				smsResult
			});

			result.warned++;

			// Auto clock-out at nag 3
			if (shouldAutoClockOut) {
				// Clock out at shift end time (not now) for accuracy
				await db
					.update(timeEntries)
					.set({
						clockOut: shiftEndTime,
						updatedAt: now,
						updatedBy: systemUserId
					})
					.where(eq(timeEntries.id, timeEntry.id));

				result.autoClockOuts++;

				log.info(
					{
						userId: user.id,
						timeEntryId: timeEntry.id,
						clockOutTime: shiftEndTime.toISOString()
					},
					'Auto clock-out executed at shift end time'
				);

				// Deduct points for forgotten clock-out
				try {
					await awardPoints({
						userId: user.id,
						basePoints: POINT_VALUES.CLOCK_OUT_FORGOTTEN,
						category: 'attendance',
						action: 'clock_out_forgotten',
						description: 'Forgot to clock out (auto clock-out after escalating reminders)',
						sourceType: 'time_entry',
						sourceId: timeEntry.id,
						metadata: { autoClockOut: true, nagCount: nagCount + 1 }
					});
				} catch (err) {
					log.error({ error: err, timeEntryId: timeEntry.id }, 'Failed to deduct points for auto clock-out');
				}

				// Check for demerit escalation
				const demerit = await checkAndEscalateToDemerit(user.id, warning.id, systemUserId);
				if (demerit) {
					result.demeritsIssued++;
				}
			}

			log.info(
				{
					userId: user.id,
					timeEntryId: timeEntry.id,
					hoursClocked: hoursClocked.toFixed(1),
					hasShift,
					nagLevel: nagCount + 1,
					smsSent: smsResult?.success ?? false,
					autoClockOut: shouldAutoClockOut
				},
				`Escalating nag ${nagCount + 1} sent for overdue clock-out`
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
