/**
 * Clock-Out Reply Service
 *
 * Acts on what an employee texts back after the overdue-clock-out reminder.
 *
 * The outcome that matters is pay. Closing an entry at the scheduled shift end
 * is correct when someone simply forgot; it silently erases real worked time
 * when they were genuinely still on the floor. So:
 *
 *   forgot / about to clock out  -> close at the scheduled shift end
 *   already left, gave a time    -> close at the time they gave, if it's sane
 *   justified overtime           -> hold the entry open, text a manager now
 *   unclear                      -> hold, flag for a manager
 *
 * Holding is not indefinite: the entry still meets the backstop in
 * clock-out-warning-service, which closes justified cases at the employee's
 * last known contact rather than at shift end, so worked time isn't invented
 * or thrown away.
 *
 * Only the FIRST reply after a reminder lands here — `findOpenClockOutReminder`
 * requires `replied_at IS NULL`. That keeps this path to a single narrow
 * exchange instead of claiming the generic SMS reply space, which belongs to
 * shift-coverage claims and the Office Manager chat channel.
 */

import {
	db,
	clockOutWarnings,
	timeEntries,
	users,
	breakEntries
} from '$lib/server/db';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { toPacificTimeString, toPacificDateString, createPacificDateTime } from '$lib/server/utils/timezone';
import { interpretClockOutReply } from '$lib/ai/office-manager/clock-out-reply';
import { appendNote } from './clock-out-warning-service';
import type { ClockOutReplyAnalysis } from '$lib/server/db/schema';

const log = createLogger('services:clock-out-reply');

/** Longest plausible shift. A self-reported time beyond this is a typo. */
const MAX_SHIFT_HOURS = 16;
/** Tolerance for a stated time that lands slightly in the future (clock skew). */
const FUTURE_TOLERANCE_MINUTES = 5;
const MAX_STORED_REPLY_CHARS = 500;

export interface OpenReminder {
	warningId: string;
	timeEntryId: string;
	userId: string;
	userName: string;
	userPhone: string | null;
	clockIn: Date;
	shiftEndTime: Date | null;
	existingNotes: string | null;
	sentAt: Date;
}

/**
 * The unanswered clock-out reminder for this user, if any.
 *
 * Requires the time entry to still be open and the reminder to be unanswered,
 * so a user who has already replied — or who clocked out themselves — falls
 * through to normal SMS routing on their next text.
 */
export async function findOpenClockOutReminder(userId: string): Promise<OpenReminder | null> {
	const [row] = await db
		.select({
			warningId: clockOutWarnings.id,
			timeEntryId: clockOutWarnings.timeEntryId,
			shiftEndTime: clockOutWarnings.shiftEndTime,
			sentAt: clockOutWarnings.createdAt,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			existingNotes: timeEntries.notes,
			userName: users.name,
			userPhone: users.phone
		})
		.from(clockOutWarnings)
		.innerJoin(timeEntries, eq(timeEntries.id, clockOutWarnings.timeEntryId))
		.innerJoin(users, eq(users.id, clockOutWarnings.userId))
		.where(
			and(
				eq(clockOutWarnings.userId, userId),
				eq(clockOutWarnings.warningType, 'auto_reminder'),
				isNull(clockOutWarnings.repliedAt),
				isNull(timeEntries.clockOut)
			)
		)
		.orderBy(desc(clockOutWarnings.createdAt))
		.limit(1);

	if (!row) return null;

	return {
		warningId: row.warningId,
		timeEntryId: row.timeEntryId,
		userId,
		userName: row.userName,
		userPhone: row.userPhone,
		clockIn: new Date(row.clockIn),
		shiftEndTime: row.shiftEndTime ? new Date(row.shiftEndTime) : null,
		existingNotes: row.existingNotes,
		sentAt: new Date(row.sentAt)
	};
}

/**
 * Turn a self-reported "HH:MM" into a real instant, or explain why not.
 *
 * The employee is telling us when they stopped working, which directly sets
 * paid hours — so it is bounded on every side rather than trusted. The time is
 * read on the clock-in's Pacific calendar day, rolling to the next day when
 * that would land before clock-in (a shift that crosses midnight).
 */
export function resolveStatedClockOut(
	statedTime: string,
	clockIn: Date,
	now: Date
): { ok: true; at: Date } | { ok: false; why: string } {
	const [hours, minutes] = statedTime.split(':').map(Number);
	const dayString = toPacificDateString(clockIn);
	let at = createPacificDateTime(dayString, hours, minutes);

	// Crossed midnight: "I left at 00:30" on a shift that began at 18:00.
	if (at.getTime() <= clockIn.getTime()) {
		at = new Date(at.getTime() + 24 * 60 * 60 * 1000);
	}

	if (at.getTime() <= clockIn.getTime()) {
		return { ok: false, why: 'that time is before you clocked in' };
	}
	if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MINUTES * 60_000) {
		return { ok: false, why: "that time hasn't happened yet" };
	}
	const hoursWorked = (at.getTime() - clockIn.getTime()) / 3_600_000;
	if (hoursWorked > MAX_SHIFT_HOURS) {
		return { ok: false, why: `that would be a ${Math.round(hoursWorked)}-hour shift` };
	}

	return { ok: true, at };
}

/** Close a time entry, ending any open break at the same instant. */
async function closeEntry(params: {
	timeEntryId: string;
	at: Date;
	note: string;
	existingNotes: string | null;
	actorId: string | null;
}): Promise<void> {
	const [openBreak] = await db
		.select({ id: breakEntries.id })
		.from(breakEntries)
		.where(and(eq(breakEntries.timeEntryId, params.timeEntryId), isNull(breakEntries.breakEnd)))
		.limit(1);

	if (openBreak) {
		await db
			.update(breakEntries)
			.set({ breakEnd: params.at })
			.where(eq(breakEntries.id, openBreak.id));
	}

	await db
		.update(timeEntries)
		.set({
			clockOut: params.at,
			notes: appendNote(params.existingNotes, params.note),
			updatedAt: new Date(),
			updatedBy: params.actorId
		})
		.where(eq(timeEntries.id, params.timeEntryId));
}

/** Tell managers an employee is working past their shift for a stated reason. */
async function notifyManagersOfOvertime(params: {
	employeeName: string;
	analysis: ClockOutReplyAnalysis;
	minutesPastShiftEnd: number;
}): Promise<void> {
	try {
		const managers = await db
			.select({ id: users.id, phone: users.phone })
			.from(users)
			.where(and(inArray(users.role, ['admin', 'manager']), eq(users.isActive, true)));

		const message =
			`${params.employeeName} is still clocked in ${Math.floor(params.minutesPastShiftEnd)} min past shift end. ` +
			`Reason given: ${params.analysis.reason} ` +
			`Their entry is being held open — confirm the hours or clock them out at /admin/timesheet.`;

		for (const manager of managers) {
			if (!manager.phone) continue;
			const formatted = formatPhoneToE164(manager.phone);
			if (!formatted) continue;
			await sendSMS(formatted, message);
		}
	} catch (err) {
		// Never let a notification failure change the clock-out outcome.
		log.error({ error: err }, 'Failed to notify managers of justified overtime');
	}
}

export interface ClockOutReplyOutcome {
	handled: boolean;
	analysis?: ClockOutReplyAnalysis;
	/** What to text back, or null when nothing should be sent. */
	reply: string | null;
	action: 'closed_at_shift_end' | 'closed_at_stated_time' | 'held_for_manager' | 'held_pending_self' | 'none';
}

/**
 * Interpret and act on one reply to a clock-out reminder.
 *
 * Returns the text to send back; the caller owns delivery so this stays usable
 * from the webhook (fire-and-forget) and from tests.
 */
export async function handleClockOutReply(params: {
	userId: string;
	replyText: string;
	systemUserId: string | null;
	now?: Date;
}): Promise<ClockOutReplyOutcome> {
	const now = params.now ?? new Date();
	const reminder = await findOpenClockOutReminder(params.userId);

	if (!reminder) {
		return { handled: false, reply: null, action: 'none' };
	}

	const shiftEnd = reminder.shiftEndTime ?? reminder.sentAt;
	const minutesPastShiftEnd = (now.getTime() - shiftEnd.getTime()) / 60_000;

	const { analysis } = await interpretClockOutReply({
		employeeName: reminder.userName,
		shiftEndTime: shiftEnd,
		minutesPastShiftEnd,
		replyText: params.replyText
	});

	// Record the reply and the verdict first. Everything below is an effect of
	// this decision, and the record must survive a failure in any of them.
	await db
		.update(clockOutWarnings)
		.set({
			userReply: params.replyText.slice(0, MAX_STORED_REPLY_CHARS),
			repliedAt: now,
			replyAnalysis: analysis
		})
		.where(eq(clockOutWarnings.id, reminder.warningId));

	const stamp = `[Office Manager] Replied ${toPacificTimeString(now)}: ${analysis.reason}`;

	// --- They say they already left ---
	if (analysis.intent === 'already_left') {
		if (!analysis.statedClockOutTime) {
			return {
				handled: true,
				analysis,
				action: 'held_for_manager',
				reply: `Thanks — what time did you clock out? Reply with the time (e.g. "5:15 PM") or set it in the app.`
			};
		}

		const resolved = resolveStatedClockOut(analysis.statedClockOutTime, reminder.clockIn, now);
		if (!resolved.ok) {
			log.warn(
				{ userId: params.userId, stated: analysis.statedClockOutTime, why: resolved.why },
				'Rejected self-reported clock-out time'
			);
			return {
				handled: true,
				analysis,
				action: 'held_for_manager',
				reply: `Sorry — ${resolved.why}. A manager will sort out your hours.`
			};
		}

		await closeEntry({
			timeEntryId: reminder.timeEntryId,
			at: resolved.at,
			existingNotes: reminder.existingNotes,
			actorId: params.systemUserId,
			note: `${stamp} Clocked out at ${toPacificTimeString(resolved.at)}, self-reported by SMS.`
		});

		return {
			handled: true,
			analysis,
			action: 'closed_at_stated_time',
			reply: `Got it — clocked you out at ${toPacificTimeString(resolved.at)}. Thanks!`
		};
	}

	// --- Still working, and the shop asked for it ---
	if (analysis.intent === 'still_working' && analysis.justified) {
		await notifyManagersOfOvertime({
			employeeName: reminder.userName,
			analysis,
			minutesPastShiftEnd
		});

		return {
			handled: true,
			analysis,
			action: 'held_for_manager',
			reply: `Understood — we've left you clocked in and let a manager know. Clock out in the app when you're done.`
		};
	}

	// --- About to clock out themselves ---
	if (analysis.intent === 'will_clock_out') {
		return {
			handled: true,
			analysis,
			action: 'held_pending_self',
			reply: `Thanks — go ahead and clock out in the app and we'll leave it alone.`
		};
	}

	// --- Still working with no business reason: treat as a forgotten clock-out ---
	if (analysis.intent === 'still_working') {
		await closeEntry({
			timeEntryId: reminder.timeEntryId,
			at: shiftEnd,
			existingNotes: reminder.existingNotes,
			actorId: params.systemUserId,
			note: `${stamp} No business reason given, so closed at the scheduled shift end (${toPacificTimeString(shiftEnd)}). Edit this entry if that's wrong.`
		});

		return {
			handled: true,
			analysis,
			action: 'closed_at_shift_end',
			reply: `Thanks — we've clocked you out at ${toPacificTimeString(shiftEnd)} (your shift end). Tell a manager if that's not right.`
		};
	}

	// --- Couldn't tell what they meant ---
	return {
		handled: true,
		analysis,
		action: 'held_for_manager',
		reply: `Thanks — we couldn't tell from that whether you're still working. Please clock out in the app, or a manager will follow up.`
	};
}
