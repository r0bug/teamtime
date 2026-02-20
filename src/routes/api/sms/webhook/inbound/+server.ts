/**
 * Twilio Inbound SMS Webhook
 *
 * POST /api/sms/webhook/inbound
 *
 * Called by Twilio when someone sends a text TO our Twilio number.
 * This captures replies, STOP/opt-out messages, and any other inbound texts.
 *
 * Twilio sends application/x-www-form-urlencoded data.
 */

import { text as textResponse, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, smsLogs, users, clockOutWarnings, timeEntries } from '$lib/server/db';
import { eq, and, gte, isNull, desc } from 'drizzle-orm';
import { validateTwilioSignature } from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';
import { awardClockOutPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';
import { auditClockEvent } from '$lib/server/services/audit-service';

const log = createLogger('api:sms:webhook:inbound');

// Words Twilio treats as opt-out (they handle blocking automatically)
const OPT_OUT_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];

// Words that mean "yes, clock me out"
const CLOCK_OUT_CONFIRM_WORDS = ['yes', 'y', 'yeah', 'yep'];

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

	// Look up user by phone number
	let userId: string | null = null;
	try {
		const [user] = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.phone, from))
			.limit(1);

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

				if (CLOCK_OUT_CONFIRM_WORDS.includes(trimmedBody)) {
					// User confirmed — auto-clock them out
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
						// Clock out the user
						await db
							.update(timeEntries)
							.set({ clockOut: now, updatedAt: now })
							.where(eq(timeEntries.id, activeEntry.id));

						// Award normal clock-out points (not penalty)
						try {
							await awardClockOutPoints(userId, activeEntry.id, true);
							await checkAndAwardAchievements(userId);
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to award points for SMS clock-out');
						}

						// Audit the clock-out
						try {
							await auditClockEvent({
								userId,
								timeEntryId: activeEntry.id,
								action: 'clock_out'
							});
						} catch (err) {
							log.warn({ error: err, userId }, 'Failed to audit SMS clock-out');
						}

						log.info({ userId, timeEntryId: activeEntry.id, warningId: recentWarning.id }, 'User auto-clocked out via SMS reply');
					}

					// Update warning record
					await db
						.update(clockOutWarnings)
						.set({ userReply: body.trim(), repliedAt: now })
						.where(eq(clockOutWarnings.id, recentWarning.id));

					return new Response(
						'<?xml version="1.0" encoding="UTF-8"?><Response><Message>Done! You\'ve been clocked out.</Message></Response>',
						{ status: 200, headers: { 'Content-Type': 'text/xml' } }
					);
				} else {
					// User replied with something else — log as their reason
					await db
						.update(clockOutWarnings)
						.set({ userReply: body.trim(), repliedAt: now })
						.where(eq(clockOutWarnings.id, recentWarning.id));

					log.info({ userId, warningId: recentWarning.id, reply: body.trim() }, 'User replied to clock-out warning with reason');

					return new Response(
						'<?xml version="1.0" encoding="UTF-8"?><Response><Message>Got it, noted. Remember to clock out when you\'re done.</Message></Response>',
						{ status: 200, headers: { 'Content-Type': 'text/xml' } }
					);
				}
			}
		} catch (err) {
			log.error({ error: err, userId }, 'Error processing clock-out warning reply');
		}
	}

	// Return empty TwiML response (no matching reply context)
	return new Response(
		'<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
		{
			status: 200,
			headers: { 'Content-Type': 'text/xml' }
		}
	);
};
