/**
 * Twilio Inbound SMS Webhook
 *
 * POST /api/sms/webhook/inbound
 *
 * Called by Twilio when someone sends a text TO our Twilio number.
 * This captures replies, STOP/opt-out messages, and any other inbound texts.
 *
 * Every inbound message is logged first, attributed to a user and/or a vendor
 * by phone number, so both halves of a conversation are on record even when
 * the sender is a vendor with no TeamTime account.
 *
 * Routing after logging, in order:
 *   1. shift-coverage claims  — conservative keyword/code parse, first-wins
 *   2. clock-out reminder replies — only while a reminder is unanswered and
 *      the entry is open, so it claims one text and no more
 *   3. the Office Manager agent — admins and managers only, PIN-gated
 *   4. everyone else: logged only
 *
 * Order matters. Shift-coverage owns the bare "YES"/code reply space outright;
 * reading it as a clock-out answer would lose a claim. The office-manager
 * branch swallows every text from a manager, so anything narrower must run
 * ahead of it.
 *
 * Twilio sends application/x-www-form-urlencoded data.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, smsLogs, users } from '$lib/server/db';
import { eq, isNotNull } from 'drizzle-orm';
import {
	validateTwilioSignature,
	formatPhoneToE164,
	sendSMS,
	findVendorByPhone
} from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';
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
import { parseClaimReply } from '$lib/server/utils/parse-claim-reply';
import {
	resolveInviteForReply,
	claimShift,
	declineRequest,
	notifyLosers
} from '$lib/server/services/shift-coverage-service';
import {
	findOpenClockOutReminder,
	handleClockOutReply
} from '$lib/server/services/clock-out-reply-service';
import { resolveSystemUserId } from '$lib/server/services/system-user';
import { isManager } from '$lib/server/auth/roles';
import { validatePinFormat } from '$lib/server/auth/pin';

const log = createLogger('api:sms:webhook:inbound');

// Words Twilio treats as opt-out (they handle blocking automatically)
const OPT_OUT_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];

/** Helper to build a TwiML response with a message */
function twiml(message: string): Response {
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
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

/** Helper to build an empty TwiML response */
function twimlEmpty(): Response {
	return new Response(
		'<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
		{ status: 200, headers: { 'Content-Type': 'text/xml' } }
	);
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

	// Also try to match a vendor. Most vendors have no user account, so without
	// this their half of the conversation lands in the log unattributed.
	const vendorId = await findVendorByPhone(from);

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
			vendorId,
			segments: numSegments ? parseInt(numSegments, 10) : null
		});
	} catch (err) {
		log.error({ error: err, messageSid }, 'Failed to log inbound SMS');
	}

	/**
	 * Reply inline via TwiML, and record it.
	 *
	 * Twilio delivers a TwiML <Message> itself, so these never pass through
	 * sendSMS and would otherwise be missing from sms_logs — leaving an inbound
	 * "YES" in the conversation view with no visible answer. Logging failures
	 * must not cost the user their reply, so they are swallowed.
	 */
	const twimlLogged = async (message: string): Promise<Response> => {
		try {
			await db.insert(smsLogs).values({
				direction: 'outbound',
				status: 'sent',
				fromNumber: to || env.TWILIO_PHONE_NUMBER || 'unknown',
				toNumber: from,
				body: message,
				userId,
				vendorId
			});
		} catch (err) {
			log.warn({ error: err, messageSid }, 'Failed to log TwiML reply');
		}
		return twiml(message);
	};

	// --- Shift coverage claims ---
	// Must run BEFORE the office-manager branch: that branch swallows every
	// text from a manager/admin, so a manager invited to cover a shift would
	// otherwise have their "YES" sent to the LLM instead of claiming.
	// Deliberately conservative — anything not clearly a claim falls through.
	if (userId && !isOptOut) {
		try {
			const claim = parseClaimReply(body);
			if (claim) {
				const invite = await resolveInviteForReply(userId, claim.code);

				if (invite.kind === 'ambiguous') {
					return twimlLogged(
						`You have ${invite.codes.length} open shift offers. Reply YES plus the code, e.g. "YES ${invite.codes[0]}". Open: ${invite.codes.join(', ')}`
					);
				}

				if (invite.kind === 'resolved') {
					if (claim.intent === 'decline') {
						await declineRequest({ requestId: invite.requestId, userId, viaSms: true });
						return twimlLogged('No problem — thanks for letting us know.');
					}

					const outcome = await claimShift({
						requestId: invite.requestId,
						userId,
						viaSms: true
					});

					if (outcome.ok) {
						// Fire-and-forget: telling everyone else can take longer
						// than Twilio's ~15s webhook window.
						notifyLosers(invite.requestId, userId).catch((err) => {
							log.error({ err, requestId: invite.requestId }, 'Failed to notify non-winners');
						});
						const applied = outcome.autoApplied
							? " It's on your schedule."
							: ' A manager will confirm it.';
						return twimlLogged(`You've got it.${applied}`);
					}

					return twimlLogged(outcome.message);
				}
				// invite.kind === 'none' → not an invitee, fall through
			}
		} catch (err) {
			log.error({ error: err, userId }, 'Error processing shift coverage reply');
		}
	}

	// --- Clock-out reminder replies ---
	// Runs after shift-coverage (a bare "YES" is a claim, not a clock-out
	// answer) and before the office-manager branch, which would otherwise
	// swallow a manager's reply to their own clock-out reminder.
	//
	// Narrow by construction: findOpenClockOutReminder only matches while the
	// reminder is unanswered and the entry is still open, so this claims the
	// FIRST text after a reminder and nothing else. Everything afterwards falls
	// through to normal routing.
	if (userId && !isOptOut) {
		try {
			const reminder = await findOpenClockOutReminder(userId);
			if (reminder) {
				// Fire-and-forget: the LLM call outlasts Twilio's ~15s window.
				handleClockOutReply({
					userId,
					replyText: body.trim(),
					systemUserId: await resolveSystemUserId()
				})
					.then((outcome) => {
						if (outcome.reply) {
							return sendSMS(from, outcome.reply).then(() => undefined);
						}
					})
					.catch((err) => {
						log.error({ err, userId }, 'Clock-out reply handling failed');
					});
				return twimlEmpty();
			}
		} catch (err) {
			// Fall through to normal routing rather than dropping their text.
			log.error({ error: err, userId }, 'Error checking for open clock-out reminder');
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
	// Every message out of this handler goes back to the person who texted in,
	// attributed to them — they are the human who caused it, so the thread in
	// /admin/sms reads as their conversation rather than anonymous system noise.
	const sendReply = (msg: string) => sendSMS(fromPhone, msg, { sentByUserId: userId });

	// Lockout check
	const lockStatus = await isSmsLocked(userId);
	if (lockStatus.locked) {
		const untilStr = lockStatus.until ? toPacificTimeString(lockStatus.until) : 'soon';
		await sendReply(`SMS commands locked until ~${untilStr} (too many wrong PIN attempts). Use the web app.`);
		return;
	}

	// Rate limit
	const rateLimit = await checkSmsRateLimit(userId);
	if (!rateLimit.allowed) {
		await sendReply(`Rate limit hit. Try again in a few minutes.`);
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
			await sendReply(`Cancelled. No action taken.`);
			return;
		}

		if (!validatePinFormat(cleaned)) {
			await sendReply(
				`Waiting for PIN to confirm: ${truncateForSms(awaiting.confirmationMessage, 200)}\nReply with your PIN (4-8 digits), or "cancel".`
			);
			return;
		}

		const ok = await verifyUserPin(userId, cleaned);
		if (!ok) {
			const result = await recordPinAttempt(awaiting.id, userId, false);
			if (result.lockedOut) {
				await sendReply(
					`Wrong PIN. Action cancelled. SMS commands locked for 30 min after ${SMS_PIN_MAX_ATTEMPTS} wrong attempts.`
				);
			} else {
				await sendReply(
					`Wrong PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left. Reply with your PIN or "cancel".`
				);
			}
			return;
		}

		// PIN correct — execute the action
		const pending = await getPendingAction(awaiting.id);
		if (!pending) {
			await sendReply(`That pending action is no longer available.`);
			return;
		}
		const exec = await executeConfirmedAction(pending.id, pending, userId);
		// Mark approved regardless of success so it doesn't re-trigger
		await approvePendingAction(pending.id, (exec.result as Record<string, unknown>) ?? {});
		if (exec.success) {
			await sendReply(`Done. ${truncateForSms(awaiting.confirmationMessage, 1000)}`);
		} else {
			const err = (exec.result as { error?: string })?.error ?? 'unknown error';
			await sendReply(`Action failed: ${truncateForSms(err, 300)}`);
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

		await sendReply(truncateForSms(reply));
	} catch (err) {
		log.error({ err, userId, chatId }, 'Office-manager SMS processing failed');
		await sendReply(`Sorry, something went wrong processing that. Try again or use the web app.`);
	}
}
