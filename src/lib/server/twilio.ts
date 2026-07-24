import twilio from 'twilio';
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';
import { db, smsLogs, users } from '$lib/server/db';
import { isNotNull } from 'drizzle-orm';

const log = createLogger('server:twilio');

// Twilio client - lazily initialized
let twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
		log.warn('Twilio credentials not configured. SMS sending disabled.');
		return null;
	}

	if (!twilioClient) {
		twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
	}

	return twilioClient;
}

export interface SMSResult {
	success: boolean;
	sid?: string;
	error?: string;
}

// Header prepended to all outgoing SMS messages
// TODO: Make this configurable from the UI
const SMS_HEADER = 'Yakima Finds Communiqué:';

/**
 * Send an SMS message via Twilio
 * @param to - The recipient's phone number (E.164 format, e.g., +15551234567)
 * @param body - The message body
 * @returns Result with success status and message SID or error
 */
export async function sendSMS(to: string, body: string): Promise<SMSResult> {
	// Prepend header to all messages
	const fullMessage = `${SMS_HEADER} ${body}`;
	const client = getClient();

	if (!client) {
		return {
			success: false,
			error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.'
		};
	}

	if (!env.TWILIO_PHONE_NUMBER) {
		return {
			success: false,
			error: 'TWILIO_PHONE_NUMBER not configured.'
		};
	}

	// Validate phone number format (basic E.164 check)
	if (!isValidPhoneNumber(to)) {
		return {
			success: false,
			error: `Invalid phone number format: ${to}. Must be E.164 format (e.g., +15551234567)`
		};
	}

	// Never text people who no longer work here. This is the single choke point
	// for ALL outbound SMS (crons, AI tools, scheduled jobs, password resets),
	// so the inactive check lives here rather than at each call site.
	const recipients = await findUsersByPhone(to);
	if (recipients.length > 0 && recipients.every((u) => !u.isActive)) {
		const error = 'Recipient is marked inactive — SMS blocked';
		log.info({ to, userIds: recipients.map((u) => u.id) }, 'SMS blocked: all matching users inactive');
		try {
			await db.insert(smsLogs).values({
				direction: 'outbound',
				status: 'failed',
				fromNumber: env.TWILIO_PHONE_NUMBER!,
				toNumber: to,
				body: fullMessage,
				userId: recipients[0].id,
				errorMessage: error
			});
		} catch (logErr) {
			log.warn({ error: logErr }, 'Failed to insert blocked-SMS log');
		}
		return { success: false, error };
	}

	try {
		const message = await client.messages.create({
			body: fullMessage,
			from: env.TWILIO_PHONE_NUMBER!,
			to,
			// Track delivery status via webhook if app URL is configured
			...(env.APP_URL ? { statusCallback: `${env.APP_URL}/api/sms/webhook/status` } : {})
		});

		// Log outbound message
		const userId = await findUserByPhone(to);
		try {
			await db.insert(smsLogs).values({
				messageSid: message.sid,
				direction: 'outbound',
				status: 'queued',
				fromNumber: env.TWILIO_PHONE_NUMBER!,
				toNumber: to,
				body: fullMessage,
				userId
			});
		} catch (logErr) {
			log.warn({ error: logErr, sid: message.sid }, 'Failed to insert SMS log');
		}

		return {
			success: true,
			sid: message.sid
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error sending SMS';
		log.error({ error: errorMessage, to }, 'Failed to send SMS');

		// Log failed attempt
		const userId = await findUserByPhone(to);
		try {
			await db.insert(smsLogs).values({
				direction: 'outbound',
				status: 'failed',
				fromNumber: env.TWILIO_PHONE_NUMBER || 'unknown',
				toNumber: to,
				body: fullMessage,
				userId,
				errorMessage
			});
		} catch (logErr) {
			log.warn({ error: logErr }, 'Failed to insert SMS failure log');
		}

		return {
			success: false,
			error: errorMessage
		};
	}
}

/**
 * Look up a user ID by phone number
 */
/**
 * Find all users whose stored phone matches this number. Stored formats vary
 * ("(509) 930-8111", "509-930-8111", "+15099308111"), so compare on the last
 * 10 digits rather than exact string equality.
 */
async function findUsersByPhone(
	phone: string
): Promise<{ id: string; isActive: boolean }[]> {
	const target = phone.replace(/\D/g, '').slice(-10);
	if (target.length < 10) return [];
	try {
		const rows = await db
			.select({ id: users.id, phone: users.phone, isActive: users.isActive })
			.from(users)
			.where(isNotNull(users.phone));
		return rows.filter((u) => (u.phone ?? '').replace(/\D/g, '').slice(-10) === target);
	} catch {
		return [];
	}
}

async function findUserByPhone(phone: string): Promise<string | null> {
	const matches = await findUsersByPhone(phone);
	if (matches.length === 0) return null;
	// Prefer an active user when a number is shared
	return (matches.find((u) => u.isActive) ?? matches[0]).id;
}

/**
 * Validate phone number format (basic E.164 check)
 * E.164: + followed by country code and subscriber number (max 15 digits)
 */
export function isValidPhoneNumber(phone: string): boolean {
	// E.164 format: + followed by 10-15 digits
	const e164Regex = /^\+[1-9]\d{9,14}$/;
	return e164Regex.test(phone);
}

/**
 * Format a US phone number to E.164 format
 * Accepts: (555) 123-4567, 555-123-4567, 5551234567, +15551234567
 */
export function formatPhoneToE164(phone: string, defaultCountryCode = '1'): string | null {
	// Remove all non-digit characters except leading +
	const cleaned = phone.replace(/[^\d+]/g, '');

	// If already E.164 format, return as-is
	if (cleaned.startsWith('+') && cleaned.length >= 11 && cleaned.length <= 16) {
		return cleaned;
	}

	// Extract digits only
	const digitsOnly = cleaned.replace(/\D/g, '');

	// US number: 10 digits
	if (digitsOnly.length === 10) {
		return `+${defaultCountryCode}${digitsOnly}`;
	}

	// US number with country code: 11 digits starting with 1
	if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
		return `+${digitsOnly}`;
	}

	// Invalid format
	return null;
}

/**
 * Check if Twilio is properly configured
 */
export function isTwilioConfigured(): boolean {
	return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
}

/**
 * Validate a Twilio webhook signature
 * Returns true if the request is genuinely from Twilio
 */
export function validateTwilioSignature(signature: string, url: string, params: Record<string, string>): boolean {
	if (!env.TWILIO_AUTH_TOKEN) return false;
	return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
}
