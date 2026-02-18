/**
 * Late Arrival Warning Service
 *
 * Handles late arrival detection, SMS notifications, and demerit escalation.
 * Implements the policy: 3 warnings in 30 days = automatic demerit.
 *
 * Mirrors clock-out-warning-service.ts structure.
 */

import {
	db,
	lateArrivalWarnings,
	demerits,
	users,
	shifts,
	timeEntries
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, gte, sql, count } from 'drizzle-orm';
import { awardPoints } from './points-service';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import type { LateArrivalWarning, Demerit } from '$lib/server/db/schema';

const log = createLogger('services:late-arrival-warning');

// ============================================================================
// CONFIGURATION
// ============================================================================

export const LATE_ARRIVAL_CONFIG = {
	GRACE_PERIOD_MINUTES: 10,            // Wait 10 min past shift start before SMS
	WARNING_THRESHOLD_FOR_DEMERIT: 3,    // Number of warnings before demerit
	WARNING_LOOKBACK_DAYS: 30,           // Count warnings in this period
	DEMERIT_POINTS_DEDUCTED: 50,         // Points deducted for demerit
	DEMERIT_EXPIRY_DAYS: 90              // Days until demerit expires
};

// ============================================================================
// SMS MESSAGES
// ============================================================================

export const SMS_MESSAGES = {
	autoReminder: (minutesLate: number) =>
		`You are ${minutesLate} minutes late for your shift. Please clock in as soon as possible or notify your manager.`,
	demeritIssued: (warningCount: number) =>
		`You have received a demerit for repeated late arrivals (${warningCount} in 30 days). ${LATE_ARRIVAL_CONFIG.DEMERIT_POINTS_DEDUCTED} points have been deducted.`
};

// ============================================================================
// WARNING FUNCTIONS
// ============================================================================

/**
 * Get the count of late arrival warnings for a user in the lookback period
 */
export async function getLateWarningCount(
	userId: string,
	lookbackDays: number = LATE_ARRIVAL_CONFIG.WARNING_LOOKBACK_DAYS
): Promise<number> {
	const lookbackDate = new Date();
	lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

	const [result] = await db
		.select({ count: count() })
		.from(lateArrivalWarnings)
		.where(
			and(
				eq(lateArrivalWarnings.userId, userId),
				gte(lateArrivalWarnings.createdAt, lookbackDate)
			)
		);

	return result?.count ?? 0;
}

/**
 * Check if a warning already exists for a specific shift today
 * (Prevents duplicate SMS for the same shift)
 */
export async function hasWarningForShiftToday(shiftId: string, userId: string): Promise<boolean> {
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const [existing] = await db
		.select({ id: lateArrivalWarnings.id })
		.from(lateArrivalWarnings)
		.where(
			and(
				eq(lateArrivalWarnings.shiftId, shiftId),
				eq(lateArrivalWarnings.userId, userId),
				gte(lateArrivalWarnings.createdAt, todayStart)
			)
		)
		.limit(1);

	return !!existing;
}

/**
 * Create a late arrival warning record
 */
export async function createLateArrivalWarning(params: {
	userId: string;
	shiftId: string;
	warningType: 'auto_reminder' | 'escalated';
	shiftStartTime: Date;
	minutesLate: number;
	smsResult?: { success: boolean; sid?: string; error?: string };
}): Promise<LateArrivalWarning> {
	const [warning] = await db
		.insert(lateArrivalWarnings)
		.values({
			userId: params.userId,
			shiftId: params.shiftId,
			warningType: params.warningType,
			shiftStartTime: params.shiftStartTime,
			minutesLate: params.minutesLate,
			smsResult: params.smsResult ?? null,
			escalatedToDemerit: false,
			demeritId: null
		})
		.returning();

	log.info(
		{
			userId: params.userId,
			shiftId: params.shiftId,
			minutesLate: params.minutesLate,
			warningId: warning.id
		},
		'Late arrival warning created'
	);

	return warning;
}

// ============================================================================
// DEMERIT ESCALATION
// ============================================================================

/**
 * Check if user should receive a demerit for repeated late arrivals
 * Returns the demerit if created, null otherwise
 */
export async function checkAndEscalateToDemerit(
	userId: string,
	warningId: string,
	issuedBy: string
): Promise<Demerit | null> {
	const warningCount = await getLateWarningCount(userId);

	log.info(
		{ userId, warningCount, threshold: LATE_ARRIVAL_CONFIG.WARNING_THRESHOLD_FOR_DEMERIT },
		'Checking late arrival demerit escalation'
	);

	if (warningCount < LATE_ARRIVAL_CONFIG.WARNING_THRESHOLD_FOR_DEMERIT) {
		return null;
	}

	// Get user info for SMS
	const [user] = await db
		.select({ id: users.id, name: users.name, phone: users.phone })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		log.error({ userId }, 'User not found when creating late arrival demerit');
		return null;
	}

	// Calculate expiry date
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + LATE_ARRIVAL_CONFIG.DEMERIT_EXPIRY_DAYS);

	// Create demerit
	const [demerit] = await db
		.insert(demerits)
		.values({
			userId,
			type: 'late_arrival',
			status: 'active',
			issuedBy,
			title: 'Repeated Late Arrivals',
			description: `Received ${warningCount} late arrival warnings within ${LATE_ARRIVAL_CONFIG.WARNING_LOOKBACK_DAYS} days. Automatic demerit issued per policy.`,
			pointsDeducted: LATE_ARRIVAL_CONFIG.DEMERIT_POINTS_DEDUCTED,
			smsNotified: false,
			expiresAt
		})
		.returning();

	log.info(
		{
			userId,
			demeritId: demerit.id,
			warningCount,
			pointsDeducted: LATE_ARRIVAL_CONFIG.DEMERIT_POINTS_DEDUCTED
		},
		'Demerit created for repeated late arrivals'
	);

	// Update warning to reference demerit
	await db
		.update(lateArrivalWarnings)
		.set({
			escalatedToDemerit: true,
			demeritId: demerit.id
		})
		.where(eq(lateArrivalWarnings.id, warningId));

	// Deduct points
	try {
		await awardPoints({
			userId,
			basePoints: -LATE_ARRIVAL_CONFIG.DEMERIT_POINTS_DEDUCTED,
			category: 'attendance',
			action: 'demerit_late_arrival',
			description: `Demerit issued: ${warningCount} late arrivals in ${LATE_ARRIVAL_CONFIG.WARNING_LOOKBACK_DAYS} days`,
			sourceType: 'demerit',
			sourceId: demerit.id,
			metadata: { warningCount, demeritId: demerit.id }
		});
	} catch (err) {
		log.error({ error: err, demeritId: demerit.id }, 'Failed to deduct points for late arrival demerit');
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
// CRON CHECK FUNCTION
// ============================================================================

export interface LateArrivalCronResult {
	checked: number;
	warned: number;
	skipped: number;
	errors: string[];
	demeritsIssued: number;
}

/**
 * Check for late arrivals and send SMS reminders.
 * Called by cron every 15 minutes.
 *
 * Logic:
 * 1. Find today's shifts where startTime + GRACE_PERIOD has passed and endTime is still future
 * 2. Left join with timeEntries to find users who have NOT clocked in
 * 3. For each late user: check if already warned today for this shift
 * 4. If not warned: send SMS, create warning, check demerit escalation
 */
export async function checkLateArrivals(systemUserId: string): Promise<LateArrivalCronResult> {
	const result: LateArrivalCronResult = {
		checked: 0,
		warned: 0,
		skipped: 0,
		errors: [],
		demeritsIssued: 0
	};

	const now = new Date();

	// Find shifts that:
	// - Started more than GRACE_PERIOD minutes ago (shift start + grace < now)
	// - Haven't ended yet (shift end > now)
	// - Belong to active users
	const lateShifts = await db
		.select({
			shift: {
				id: shifts.id,
				userId: shifts.userId,
				startTime: shifts.startTime,
				endTime: shifts.endTime
			},
			user: {
				id: users.id,
				name: users.name,
				phone: users.phone
			},
			timeEntryId: timeEntries.id
		})
		.from(shifts)
		.innerJoin(users, eq(shifts.userId, users.id))
		.leftJoin(
			timeEntries,
			and(
				eq(timeEntries.userId, shifts.userId),
				// Match any time entry where user clocked in on the shift day
				// This catches both open entries and already-closed entries
				gte(timeEntries.clockIn, sql`${shifts.startTime}::date::timestamp with time zone`)
			)
		)
		.where(
			and(
				// Shift started more than grace period ago
				sql`${shifts.startTime} + interval '${sql.raw(String(LATE_ARRIVAL_CONFIG.GRACE_PERIOD_MINUTES))} minutes' < ${now}`,
				// Shift hasn't ended yet
				sql`${shifts.endTime} > ${now}`,
				// Active user
				eq(users.isActive, true)
			)
		);

	// Filter to only users with NO time entry (not clocked in)
	const notClockedIn = lateShifts.filter(row => row.timeEntryId === null);

	log.info(
		{ totalShifts: lateShifts.length, notClockedIn: notClockedIn.length },
		'Checking late arrivals'
	);

	for (const { shift, user } of notClockedIn) {
		result.checked++;

		try {
			// Check if already warned today for this shift
			const alreadyWarned = await hasWarningForShiftToday(shift.id, user.id);
			if (alreadyWarned) {
				result.skipped++;
				continue;
			}

			const shiftStart = new Date(shift.startTime);
			const minutesLate = Math.floor((now.getTime() - shiftStart.getTime()) / (1000 * 60));

			// Send SMS reminder
			let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
			if (user.phone) {
				const formatted = formatPhoneToE164(user.phone);
				if (formatted) {
					smsResult = await sendSMS(formatted, SMS_MESSAGES.autoReminder(minutesLate));
				}
			}

			// Create warning record
			const warning = await createLateArrivalWarning({
				userId: user.id,
				shiftId: shift.id,
				warningType: 'auto_reminder',
				shiftStartTime: shiftStart,
				minutesLate,
				smsResult
			});

			result.warned++;

			// Check for demerit escalation
			const demerit = await checkAndEscalateToDemerit(user.id, warning.id, systemUserId);
			if (demerit) {
				result.demeritsIssued++;
			}

			log.info(
				{
					userId: user.id,
					shiftId: shift.id,
					minutesLate,
					smsSent: smsResult?.success ?? false,
					demeritIssued: !!demerit
				},
				'Late arrival warning sent'
			);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			result.errors.push(`User ${user.id}: ${errorMsg}`);
			log.error({ error: err, userId: user.id }, 'Error processing late arrival');
		}
	}

	log.info(result, 'Late arrival check completed');
	return result;
}
