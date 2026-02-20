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
import { db, smsLogs, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { validateTwilioSignature } from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:sms:webhook:inbound');

// Words Twilio treats as opt-out (they handle blocking automatically)
const OPT_OUT_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];

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

	// Return empty TwiML response (no auto-reply)
	// If you want to auto-reply, return XML like:
	// <Response><Message>Thanks for your reply!</Message></Response>
	return new Response(
		'<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
		{
			status: 200,
			headers: { 'Content-Type': 'text/xml' }
		}
	);
};
