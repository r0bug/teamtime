/**
 * Twilio Status Callback Webhook
 *
 * POST /api/sms/webhook/status
 *
 * Called by Twilio when an outbound message status changes:
 * queued -> sent -> delivered (success path)
 * queued -> sent -> undelivered/failed (failure path)
 *
 * Twilio sends application/x-www-form-urlencoded data.
 */

import { json, text as textResponse } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, smsLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { validateTwilioSignature } from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:sms:webhook:status');

// Map Twilio status strings to our enum values
type SmsStatusValue = 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'received' | 'opt_out';
const STATUS_MAP: Record<string, SmsStatusValue> = {
	queued: 'queued',
	sent: 'sent',
	delivered: 'delivered',
	undelivered: 'undelivered',
	failed: 'failed'
};

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
			log.warn({ signature: signature.slice(0, 10) }, 'Invalid Twilio signature on status callback');
			return json({ error: 'Invalid signature' }, { status: 403 });
		}
	}

	const messageSid = params.MessageSid;
	const messageStatus = params.MessageStatus;
	const errorCode = params.ErrorCode;
	const errorMessage = params.ErrorMessage;

	if (!messageSid || !messageStatus) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	const status = STATUS_MAP[messageStatus];
	if (!status) {
		log.warn({ messageStatus, messageSid }, 'Unknown Twilio status');
		return textResponse('', { status: 204 });
	}

	log.info({ messageSid, status, errorCode }, 'SMS status update received');

	try {
		// Update existing log entry
		const [updated] = await db
			.update(smsLogs)
			.set({
				status,
				errorCode: errorCode || null,
				errorMessage: errorMessage || null,
				statusUpdatedAt: new Date()
			})
			.where(eq(smsLogs.messageSid, messageSid))
			.returning({ id: smsLogs.id });

		if (!updated) {
			// If we don't have a log entry yet (race condition), create one
			log.warn({ messageSid }, 'No SMS log found for status update, creating entry');
			await db.insert(smsLogs).values({
				messageSid,
				direction: 'outbound',
				status,
				fromNumber: params.From || 'unknown',
				toNumber: params.To || 'unknown',
				errorCode: errorCode || null,
				errorMessage: errorMessage || null,
				statusUpdatedAt: new Date()
			});
		}
	} catch (err) {
		log.error({ error: err, messageSid }, 'Failed to update SMS log');
	}

	// Twilio expects an empty 200/204 response
	return textResponse('', { status: 204 });
};
