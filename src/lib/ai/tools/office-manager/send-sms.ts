// Send SMS Tool - Allows AI to send SMS messages to users via Twilio
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { sendSMS, formatPhoneToE164, isValidPhoneNumber } from '$lib/server/twilio';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';

const log = createLogger('ai:tools:send-sms');

interface SendSMSParams {
	toUserId?: string;
	toPhone?: string; // Direct phone number (E.164 format)
	message: string;
}

interface SendSMSResult {
	success: boolean;
	recipientName?: string;
	recipientPhone?: string;
	messageSid?: string;
	error?: string;
}

export const sendSMSTool: AITool<SendSMSParams, SendSMSResult> = {
	name: 'send_sms',
	description: 'Send an SMS text message to a staff member. Use for urgent notifications that need immediate attention. Messages should be concise (160 chars or less for best delivery).',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			toUserId: {
				type: 'string',
				description: 'The user ID to send the SMS to (will use their stored phone number)'
			},
			toPhone: {
				type: 'string',
				description: 'Direct phone number in E.164 format (e.g., +15551234567). Use only if toUserId not provided.'
			},
			message: {
				type: 'string',
				description: 'The SMS message content (keep under 160 chars for best delivery)'
			}
		},
		required: ['message']
	},

	requiresApproval: false,
	requiresConfirmation: true, // Requires user confirmation in chat mode

	cooldown: {
		perUser: 5, // Don't SMS same user more than once per 5 min
		global: 2 // Don't send more than once every 2 min globally
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: SendSMSParams): string {
		if (params.toUserId) {
			return `Send SMS to user?\n\nMessage: "${params.message}"`;
		}
		return `Send SMS to ${params.toPhone}?\n\nMessage: "${params.message}"`;
	},

	validate(params: SendSMSParams) {
		if (!params.message || params.message.trim().length < 2) {
			return { valid: false, error: 'SMS message is required' };
		}
		if (params.message.length > 1600) {
			return { valid: false, error: 'SMS message too long (max 1600 chars, but 160 is recommended)' };
		}
		if (!params.toUserId && !params.toPhone) {
			return { valid: false, error: 'Either toUserId or toPhone is required' };
		}
		// Validate user ID format if provided
		if (params.toUserId) {
			const userIdValidation = validateUserId(params.toUserId, 'toUserId');
			if (!userIdValidation.valid) {
				return userIdValidation;
			}
		}
		if (params.toPhone && !isValidPhoneNumber(params.toPhone)) {
			// Try to format it
			const formatted = formatPhoneToE164(params.toPhone);
			if (!formatted) {
				return { valid: false, error: 'Invalid phone number format. Use E.164 format (e.g., +15551234567)' };
			}
		}
		return { valid: true };
	},

	async execute(params: SendSMSParams, context: ToolExecutionContext): Promise<SendSMSResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - SMS would be sent'
			};
		}

		try {
			let phoneNumber: string;
			let recipientName: string | undefined;

			if (params.toUserId) {
				// Look up user's phone number
				const user = await db
					.select({ id: users.id, name: users.name, phone: users.phone })
					.from(users)
					.where(eq(users.id, params.toUserId))
					.limit(1);

				if (user.length === 0) {
					return { success: false, error: 'User not found' };
				}

				if (!user[0].phone) {
					return { success: false, error: `User ${user[0].name} has no phone number on file` };
				}

				// Format phone number
				const formatted = formatPhoneToE164(user[0].phone);
				if (!formatted) {
					return {
						success: false,
						error: `User's phone number "${user[0].phone}" is not in a valid format`
					};
				}

				phoneNumber = formatted;
				recipientName = user[0].name;
			} else if (params.toPhone) {
				// Use direct phone number
				const formatted = formatPhoneToE164(params.toPhone);
				if (!formatted) {
					return { success: false, error: 'Invalid phone number format' };
				}
				phoneNumber = formatted;
			} else {
				return { success: false, error: 'No phone number specified' };
			}

			// Send the SMS
			const result = await sendSMS(phoneNumber, params.message);

			if (!result.success) {
				return {
					success: false,
					error: result.error || 'Failed to send SMS'
				};
			}

			return {
				success: true,
				recipientName,
				recipientPhone: phoneNumber,
				messageSid: result.sid
			};
		} catch (error) {
			log.error('Send SMS tool error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: SendSMSResult): string {
		if (result.success) {
			const recipient = result.recipientName || result.recipientPhone || 'recipient';
			return `SMS sent to ${recipient}`;
		}
		return `Failed to send SMS: ${result.error}`;
	}
};
