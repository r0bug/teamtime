/**
 * Twilio Inbound SMS Webhook
 *
 * POST /api/sms/webhook/inbound
 *
 * Called by Twilio when someone sends a text TO our Twilio number.
 * This captures replies, STOP/opt-out messages, and any other inbound texts.
 *
 * Supports smart time parsing: employees can reply with their actual clock-out
 * time (e.g. "5:30 PM", "530", "left at 3:30") and the system will use that
 * time instead of NOW. Also handles replies after auto-clock-out.
 *
 * Twilio sends application/x-www-form-urlencoded data.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, smsLogs, users, clockOutWarnings, timeEntries } from '$lib/server/db';
import { eq, and, gte, isNull, isNotNull, desc } from 'drizzle-orm';
import { validateTwilioSignature, formatPhoneToE164, sendSMS } from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';
import { awardClockOutPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';
import { auditClockEvent } from '$lib/server/services/audit-service';
import { parseTimeReply } from '$lib/server/utils/parse-time-reply';
import { SMS_MESSAGES } from '$lib/server/services/clock-out-warning-service';
import { toPacificTimeString } from '$lib/server/utils/timezone';
import {
	getOrCreateSmsChat,
	isSmsLocked,
	checkSmsRateLimit,
	findAwaitingPinAction,
	verifyUserPin,
	recordPinAttempt,
	markRecentActionsRequirePin,
	SMS_PIN_MAX_ATTEMPTS
} from '$lib/server/services/sms-chat-service';
import {
	processUserMessage,
	executeConfirmedAction,
	approvePendingAction,
	rejectPendingAction,
	getPendingAction
} from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';
import { validatePinFormat } from '$lib/server/auth/pin';

const log = createLogger('api:sms:webhook:inbound');

// Words Twilio treats as opt-out (they handle blocking automatically)
const OPT_OUT_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];

// Words that mean "yes, clock me out"
const CLOCK_OUT_CONFIRM_WORDS = ['yes', 'y', 'yeah', 'yep'];

/** Helper to build a TwiML response with a message */
function twiml(message: string): Response {
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
		{ status: 200, headers: { 'Content-Type': 'text/xml' } }
	);
}

/** Helper to build an empty TwiML response */
function twimlEmpty(): Response {
	return new Response(
		'<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
		{ status: 200, headers: { 'Content-Type': 'text/xml' } }
	);
}

/** Escape special XML characters */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export const POST: RequestHandler = async ({ request, url }) => {
	const formData = await request.formData();
	const params: Record<string, string> = {};
	for (const [key, value] of formData.entries()) {
		params[key] = String(value);
	}

	// Validate Twilio signature in production
	if (env.APP_URL) {
		const signature = request.headers.get('X-Twilio-Signature') || '';
		const webhookUrl = `${env.APP_URL}${url.pathname}`;
		if (!validateTwilioSignature(signature, webhookUrl, params)) {
			log.warn({ signature: signature.slice(0, 10) }, 'Invalid Twilio signature on inbound webhook');
			return json({ error: 'Invalid signature' }, { status: 403 });
		}
	}

	const messageSid = params.MessageSid;
	const from = params.From; // The sender's phone number
	const to = params.To; // Our Twilio number
	const body = params.Body || '';
	const numSegments = params.NumSegments;

	if (!messageSid || !from) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Determine if this is an opt-out
	const normalizedBody = body.trim().toLowerCase();
	const isOptOut = OPT_OUT_WORDS.includes(normalizedBody);

	log.info({ messageSid, from, isOptOut, bodyPreview: body.slice(0, 50) }, 'Inbound SMS received');

	// Look up user by phone number (normalize to E.164 for comparison since
	// Twilio sends E.164 but users may have stored phone in various formats)
	let userId: string | null = null;
	try {
		const usersWithPhones = await db
			.select({ id: users.id, name: users.name, phone: users.phone })
			.from(users)
			.where(isNotNull(users.phone));

		const user = usersWithPhones.find(
			(u) => u.phone && formatPhoneToE164(u.phone) === from
		);

		if (user) {
			userId = user.id;
			if (isOptOut) {
				log.warn({ userId, userName: user.name, from }, 'User opted out of SMS');
			}
		}
	} catch (err) {
		log.warn({ error: err }, 'Failed to look up user by phone');
	}

	// Log the inbound message
	try {
		await db.insert(smsLogs).values({
			messageSid,
			direction: 'inbound',
			status: isOptOut ? 'opt_out' : 'received',
			fromNumber: from,
			toNumber: to || '',
			body,
			userId,
			segments: numSegments ? parseInt(numSegments, 10) : null
		});
	} catch (err) {
		log.error({ error: err, messageSid }, 'Failed to log inbound SMS');
	}

	// Process clock-out warning replies
	if (userId && !isOptOut) {
		try {
			const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

			// Find recent clock-out warning for this user that hasn't been replied to
			const [recentWarning] = await db
				.select({
					id: clockOutWarnings.id,
					timeEntryId: clockOutWarnings.timeEntryId,
					userId: clockOutWarnings.userId
				})
				.from(clockOutWarnings)
				.where(
					and(
						eq(clockOutWarnings.userId, userId),
						eq(clockOutWarnings.warningType, 'auto_reminder'),
						gte(clockOutWarnings.createdAt, fourHoursAgo),
						isNull(clockOutWarnings.userReply)
					)
				)
				.orderBy(desc(clockOutWarnings.createdAt))
				.limit(1);

			if (recentWarning) {
				const trimmedBody = normalizedBody.trim();
				const now = new Date();

				// --- YES/Y: clock out at NOW ---
				if (CLOCK_OUT_CONFIRM_WORDS.includes(trimmedBody)) {
					const [activeEntry] = await db
						.select()
						.from(timeEntries)
						.where(
							and(
								eq(timeEntries.id, recentWarning.timeEntryId),
								isNull(timeEntries.clockOut)
							)
						)
						.limit(1);

					if (activeEntry) {
						await db
							.update(timeEntries)
							.set({ clockOut: now, updatedAt: now })
							.where(eq(timeEntries.id, activeEntry.id));

						try {
							await awardClockOutPoints(userId, activeEntry.id, true);
							await checkAndAwardAchievements(userId);
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to award points for SMS clock-out');
						}

						try {
							await auditClockEvent({
								userId,
								timeEntryId: activeEntry.id,
								action: 'clock_out'
							});
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to audit SMS clock-out');
						}

						log.info({ userId, timeEntryId: activeEntry.id, warningId: recentWarning.id }, 'User clocked out via SMS YES reply');
					}

					await db
						.update(clockOutWarnings)
						.set({ userReply: body.trim(), repliedAt: now })
						.where(eq(clockOutWarnings.id, recentWarning.id));

					return twiml("Done! You've been clocked out.");
				}

				// --- Try to parse a time from the reply ---
				const parsedTime = parseTimeReply(body);

				if (parsedTime) {
					// Check if the user still has an active (open) time entry
					const [activeEntry] = await db
						.select()
						.from(timeEntries)
						.where(
							and(
								eq(timeEntries.id, recentWarning.timeEntryId),
								isNull(timeEntries.clockOut)
							)
						)
						.limit(1);

					if (activeEntry) {
						const clockInTime = new Date(activeEntry.clockIn);

						// Validate: parsed time must be after clock-in and not in the future
						if (parsedTime <= clockInTime) {
							log.warn({ userId, parsedTime, clockInTime }, 'Parsed time is before clock-in');
							await db
								.update(clockOutWarnings)
								.set({ userReply: body.trim(), repliedAt: now })
								.where(eq(clockOutWarnings.id, recentWarning.id));
							return twiml(SMS_MESSAGES.timeParseError);
						}

						if (parsedTime > now) {
							log.warn({ userId, parsedTime, now }, 'Parsed time is in the future');
							await db
								.update(clockOutWarnings)
								.set({ userReply: body.trim(), repliedAt: now })
								.where(eq(clockOutWarnings.id, recentWarning.id));
							return twiml(SMS_MESSAGES.timeParseError);
						}

						// Clock out at the parsed time
						await db
							.update(timeEntries)
							.set({ clockOut: parsedTime, updatedAt: now })
							.where(eq(timeEntries.id, activeEntry.id));

						// Award normal clock-out points (not penalty)
						try {
							await awardClockOutPoints(userId, activeEntry.id, true);
							await checkAndAwardAchievements(userId);
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to award points for SMS time-parsed clock-out');
						}

						// Audit with note about SMS correction
						try {
							await auditClockEvent({
								userId,
								timeEntryId: activeEntry.id,
								action: 'clock_out'
							});
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to audit SMS time-parsed clock-out');
						}

						const timeStr = toPacificTimeString(parsedTime);
						log.info({ userId, timeEntryId: activeEntry.id, parsedTime: timeStr, warningId: recentWarning.id }, 'User clocked out via SMS with parsed time');

						await db
							.update(clockOutWarnings)
							.set({ userReply: body.trim(), repliedAt: now })
							.where(eq(clockOutWarnings.id, recentWarning.id));

						return twiml(SMS_MESSAGES.timeConfirmed(timeStr));
					}

					// --- Entry already clocked out (auto-clock-out happened) ---
					// Update the most recent time entry's clockOut to the parsed time
					const [closedEntry] = await db
						.select()
						.from(timeEntries)
						.where(
							and(
								eq(timeEntries.id, recentWarning.timeEntryId),
								isNotNull(timeEntries.clockOut)
							)
						)
						.limit(1);

					if (closedEntry) {
						const clockInTime = new Date(closedEntry.clockIn);

						if (parsedTime > clockInTime && parsedTime <= now) {
							await db
								.update(timeEntries)
								.set({ clockOut: parsedTime, updatedAt: now })
								.where(eq(timeEntries.id, closedEntry.id));

							const timeStr = toPacificTimeString(parsedTime);
							log.info({ userId, timeEntryId: closedEntry.id, parsedTime: timeStr, warningId: recentWarning.id }, 'Updated already-closed time entry clock-out via SMS');

							await db
								.update(clockOutWarnings)
								.set({ userReply: body.trim(), repliedAt: now })
								.where(eq(clockOutWarnings.id, recentWarning.id));

							return twiml(SMS_MESSAGES.timeUpdated(timeStr));
						}
					}

					// Time parsed but could not apply — invalid range
					await db
						.update(clockOutWarnings)
						.set({ userReply: body.trim(), repliedAt: now })
						.where(eq(clockOutWarnings.id, recentWarning.id));
					return twiml(SMS_MESSAGES.timeParseError);
				}

				// --- Could not parse time — reply with help message ---
				await db
					.update(clockOutWarnings)
					.set({ userReply: body.trim(), repliedAt: now })
					.where(eq(clockOutWarnings.id, recentWarning.id));

				log.info({ userId, warningId: recentWarning.id, reply: body.trim() }, 'User replied to clock-out warning, could not parse time');

				return twiml(SMS_MESSAGES.timeParseError);
			}

			// --- No unreplied warning, but check for recently replied warnings ---
			// Handle replies AFTER auto-clock-out: user might text "I left at 4:30" later
			const [recentRepliedWarning] = await db
				.select({
					id: clockOutWarnings.id,
					timeEntryId: clockOutWarnings.timeEntryId,
					userId: clockOutWarnings.userId
				})
				.from(clockOutWarnings)
				.where(
					and(
						eq(clockOutWarnings.userId, userId),
						gte(clockOutWarnings.createdAt, fourHoursAgo)
					)
				)
				.orderBy(desc(clockOutWarnings.createdAt))
				.limit(1);

			if (recentRepliedWarning) {
				const parsedTime = parseTimeReply(body);

				if (parsedTime) {
					const now = new Date();

					// Find the time entry (should be closed by now)
					const [closedEntry] = await db
						.select()
						.from(timeEntries)
						.where(
							and(
								eq(timeEntries.id, recentRepliedWarning.timeEntryId),
								isNotNull(timeEntries.clockOut)
							)
						)
						.limit(1);

					if (closedEntry) {
						const clockInTime = new Date(closedEntry.clockIn);

						if (parsedTime > clockInTime && parsedTime <= now) {
							await db
								.update(timeEntries)
								.set({ clockOut: parsedTime, updatedAt: now })
								.where(eq(timeEntries.id, closedEntry.id));

							const timeStr = toPacificTimeString(parsedTime);
							log.info({ userId, timeEntryId: closedEntry.id, parsedTime: timeStr }, 'Updated clock-out time via late SMS reply');

							return twiml(SMS_MESSAGES.timeUpdated(timeStr));
						}
					}
				}
			}
		} catch (err) {
			log.error({ error: err, userId }, 'Error processing clock-out warning reply');
		}
	}

	// --- Office-Manager SMS channel ---
	// Admins and managers can converse with the Office Manager AI via SMS.
	// Destructive actions (any tool that requires confirmation in the web chat) require
	// the user to reply with their login PIN to approve.
	if (userId && !isOptOut) {
		try {
			const [userRow] = await db
				.select({ id: users.id, role: users.role, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (userRow?.isActive && isManager(userRow as Parameters<typeof isManager>[0])) {
				// Fire-and-forget: Twilio only allows ~15s and the LLM takes longer.
				// Respond with empty TwiML immediately; we'll send outbound SMS when ready.
				handleOfficeManagerInbound(userRow.id, from, body.trim()).catch((err) => {
					log.error({ err, userId: userRow.id }, 'office-manager SMS handler error');
				});
				return twimlEmpty();
			}
		} catch (err) {
			log.error({ error: err, userId }, 'Error checking office-manager SMS eligibility');
		}
	}

	// Return empty TwiML response (no matching reply context)
	return twimlEmpty();
};

/** Truncate a reply to fit comfortably in a few SMS segments. */
function truncateForSms(body: string, max = 1400): string {
	if (body.length <= max) return body;
	return body.slice(0, max - 3) + '...';
}

/**
 * Handle an inbound SMS from a manager/admin as an office-manager command.
 * Called fire-and-forget; sends outbound SMS with the reply when done.
 */
async function handleOfficeManagerInbound(userId: string, fromPhone: string, text: string): Promise<void> {
	// Lockout check
	const lockStatus = await isSmsLocked(userId);
	if (lockStatus.locked) {
		const untilStr = lockStatus.until ? toPacificTimeString(lockStatus.until) : 'soon';
		await sendSMS(fromPhone, `SMS commands locked until ~${untilStr} (too many wrong PIN attempts). Use the web app.`);
		return;
	}

	// Rate limit
	const rateLimit = await checkSmsRateLimit(userId);
	if (!rateLimit.allowed) {
		await sendSMS(fromPhone, `Rate limit hit. Try again in a few minutes.`);
		log.warn({ userId, fromPhone }, 'SMS office-manager rate limit exceeded');
		return;
	}

	// Get or create the active SMS chat session
	const { id: chatId, createdNew } = await getOrCreateSmsChat(userId);
	if (createdNew) {
		log.info({ userId, chatId }, 'Created new SMS chat session');
	}

	// --- Check for a pending PIN-required action. If one exists, treat this
	//     message as a PIN (or a cancel). ---
	const awaiting = await findAwaitingPinAction(chatId);
	if (awaiting) {
		const cleaned = text.trim();
		const lowerCleaned = cleaned.toLowerCase();

		if (lowerCleaned === 'cancel' || lowerCleaned === 'no' || lowerCleaned === 'n') {
			await rejectPendingAction(awaiting.id);
			await sendSMS(fromPhone, `Cancelled. No action taken.`);
			return;
		}

		if (!validatePinFormat(cleaned)) {
			await sendSMS(
				fromPhone,
				`Waiting for PIN to confirm: ${truncateForSms(awaiting.confirmationMessage, 200)}\nReply with your PIN (4-8 digits), or "cancel".`
			);
			return;
		}

		const ok = await verifyUserPin(userId, cleaned);
		if (!ok) {
			const result = await recordPinAttempt(awaiting.id, userId, false);
			if (result.lockedOut) {
				await sendSMS(
					fromPhone,
					`Wrong PIN. Action cancelled. SMS commands locked for 30 min after ${SMS_PIN_MAX_ATTEMPTS} wrong attempts.`
				);
			} else {
				await sendSMS(
					fromPhone,
					`Wrong PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left. Reply with your PIN or "cancel".`
				);
			}
			return;
		}

		// PIN correct — execute the action
		const pending = await getPendingAction(awaiting.id);
		if (!pending) {
			await sendSMS(fromPhone, `That pending action is no longer available.`);
			return;
		}
		const exec = await executeConfirmedAction(pending.id, pending, userId);
		// Mark approved regardless of success so it doesn't re-trigger
		await approvePendingAction(pending.id, (exec.result as Record<string, unknown>) ?? {});
		if (exec.success) {
			await sendSMS(fromPhone, `Done. ${truncateForSms(awaiting.confirmationMessage, 1000)}`);
		} else {
			const err = (exec.result as { error?: string })?.error ?? 'unknown error';
			await sendSMS(fromPhone, `Action failed: ${truncateForSms(err, 300)}`);
		}
		return;
	}

	// --- Normal conversation turn ---
	const startMs = Date.now();
	try {
		const result = await processUserMessage(chatId, text, undefined, userId);

		// Flag any newly-created pending actions as PIN-required (SMS channel policy)
		const flagged = await markRecentActionsRequirePin(chatId, startMs - 1_000);
		if (flagged > 0) {
			log.info({ userId, chatId, flagged }, 'Flagged SMS pending actions as requiring PIN');
		}

		// Build reply. If the LLM scheduled destructive actions, give the user the
		// PIN prompt instead of the verbose response.
		let reply: string;
		if (result.pendingActions.length > 0) {
			const first = result.pendingActions[0];
			const extra = result.pendingActions.length > 1 ? ` (+${result.pendingActions.length - 1} more pending)` : '';
			reply = `PIN required to confirm:\n${first.confirmationMessage}${extra}\n\nReply with your PIN (4-8 digits) to approve, or "cancel".`;
		} else {
			reply = result.response || '(no response)';
		}

		await sendSMS(fromPhone, truncateForSms(reply));
	} catch (err) {
		log.error({ err, userId, chatId }, 'Office-manager SMS processing failed');
		await sendSMS(fromPhone, `Sorry, something went wrong processing that. Try again or use the web app.`);
	}
}
