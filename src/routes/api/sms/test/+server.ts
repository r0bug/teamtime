import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendSMS, isTwilioConfigured, formatPhoneToE164 } from '$lib/server/twilio';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:sms:test');

// POST /api/sms/test - Send a test SMS (admin only)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Admin access required' }, { status: 403 });
	}

	if (!isTwilioConfigured()) {
		return json({
			success: false,
			error: 'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env'
		}, { status: 400 });
	}

	const body = await request.json();
	const phone = body.phone as string;

	if (!phone) {
		return json({ error: 'Phone number is required' }, { status: 400 });
	}

	const formatted = formatPhoneToE164(phone);
	if (!formatted) {
		return json({
			success: false,
			error: `Invalid phone number: "${phone}". Use format like (555) 123-4567 or +15551234567`
		}, { status: 400 });
	}

	log.info({ adminId: locals.user.id, to: formatted }, 'Sending test SMS');

	const result = await sendSMS(formatted, 'This is a test message from TeamTime. If you received this, SMS is working correctly.');

	if (result.success) {
		log.info({ sid: result.sid }, 'Test SMS sent successfully');
	} else {
		log.error({ error: result.error }, 'Test SMS failed');
	}

	return json(result);
};
