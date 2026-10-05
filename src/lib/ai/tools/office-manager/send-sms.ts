// Send SMS Tool - Allows AI to send SMS messages to staff and vendors via Twilio
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { sendSMS, formatPhoneToE164, isValidPhoneNumber } from '$lib/server/twilio';
import {
	getBroadcastStaff,
	getVendorSmsTarget,
	getVendorSmsTargets,
	type VendorSmsTarget
} from '$lib/server/services/user-classification-service';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateUserId } from '../utils/validation';

const log = createLogger('ai:tools:send-sms');

interface SendSMSParams {
	toUserId?: string;
	toPhone?: string; // Direct phone number (E.164 format)
	toVendorId?: string; // TeamTime vendor UUID
	message: string;
	toAllStaff?: boolean; // Send to all active staff with phone numbers
	toAllVendors?: boolean; // Send to all active vendors with phone numbers
}

interface SendSMSResult {
	success: boolean;
	recipientName?: string;
	recipientPhone?: string;
	messageSid?: string;
	recipientCount?: number;
	/** Which record the number came from, for vendor sends. */
	phoneSource?: VendorSmsTarget['source'];
	/** Names of intended recipients we had no usable number for. */
	unreachable?: string[];
	error?: string;
}

/** Only one target may be set per call. */
const TARGET_KEYS = ['toUserId', 'toPhone', 'toVendorId', 'toAllStaff', 'toAllVendors'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fan a message out to a list of vendors.
 *
 * Sends are sequential on purpose: Twilio rate-limits per number, and a
 * failure on one vendor must not abort the rest of the broadcast.
 */
async function broadcastToVendors(
	targets: VendorSmsTarget[],
	message: string,
	sentByUserId?: string
): Promise<SendSMSResult> {
	const reachable = targets.filter((v) => v.phone && formatPhoneToE164(v.phone));
	const unreachable = targets.filter((v) => !v.phone || !formatPhoneToE164(v.phone));

	if (reachable.length === 0) {
		return {
			success: false,
			error: 'No vendors with a usable phone number. Add contact numbers on the vendor records first.',
			unreachable: unreachable.map((v) => v.displayName)
		};
	}

	let successCount = 0;
	const errors: string[] = [];

	for (const vendor of reachable) {
		const formatted = formatPhoneToE164(vendor.phone!);
		if (!formatted) continue;

		const result = await sendSMS(formatted, message, {
			sentByUserId,
			vendorId: vendor.vendorId
		});
		if (result.success) {
			successCount++;
		} else {
			errors.push(`${vendor.displayName}: ${result.error}`);
		}
	}

	if (successCount === 0) {
		return {
			success: false,
			error: `Failed to send SMS to any vendor. Errors: ${errors.join(', ')}`,
			unreachable: unreachable.map((v) => v.displayName)
		};
	}

	const failCount = errors.length;
	return {
		success: true,
		recipientName: `all vendors (${successCount} sent${failCount > 0 ? `, ${failCount} failed` : ''})`,
		recipientCount: successCount,
		unreachable: unreachable.map((v) => v.displayName)
	};
}

export const sendSMSTool: AITool<SendSMSParams, SendSMSResult> = {
	name: 'send_sms',
	description:
		'Send an SMS text message to staff or booth vendors. Target one person (toUserId for staff, toVendorId for a vendor), a raw phone number (toPhone), or broadcast with toAllStaff or toAllVendors. Vendors are texted on their vendor-record contact number when they have no portal account. Use list_vendors to find a vendor id. Messages should be concise (160 chars or less for best delivery).',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			toUserId: {
				type: 'string',
				description: 'The staff user ID to send the SMS to (will use their stored phone number)'
			},
			toPhone: {
				type: 'string',
				description: 'Direct phone number in E.164 format (e.g., +15551234567). Use only if no other target is provided.'
			},
			toVendorId: {
				type: 'string',
				description: 'TeamTime vendor UUID (from list_vendors or get_vendor). Uses the vendor\'s portal account phone when they have one, otherwise the vendor record contact number.'
			},
			message: {
				type: 'string',
				description: 'The SMS message content (keep under 160 chars for best delivery)'
			},
			toAllStaff: {
				type: 'boolean',
				description: 'If true, sends SMS to all active staff members who have phone numbers on file (use for urgent team-wide alerts). Excludes vendors and admins.'
			},
			toAllVendors: {
				type: 'boolean',
				description: 'If true, sends SMS to every active booth vendor with a usable phone number. Use for vendor-wide announcements such as rent reminders or store closures.'
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
		if (params.toAllStaff) {
			return `Send SMS to ALL STAFF?\n\nMessage: "${params.message}"\n\nThis will send to all active staff members with phone numbers on file.`;
		}
		if (params.toAllVendors) {
			return `Send SMS to ALL VENDORS?\n\nMessage: "${params.message}"\n\nThis will send to every active booth vendor with a phone number on file.`;
		}
		if (params.toVendorId) {
			return `Send SMS to vendor?\n\nMessage: "${params.message}"`;
		}
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

		const targets = TARGET_KEYS.filter((k) => params[k]);
		if (targets.length === 0) {
			return {
				valid: false,
				error: 'One of toUserId, toPhone, toVendorId, toAllStaff, or toAllVendors is required'
			};
		}
		if (targets.length > 1) {
			return { valid: false, error: `Only one target may be set, got: ${targets.join(', ')}` };
		}

		// Validate user ID format if provided
		if (params.toUserId) {
			const userIdValidation = validateUserId(params.toUserId, 'toUserId');
			if (!userIdValidation.valid) {
				return userIdValidation;
			}
		}
		if (params.toVendorId && !UUID_RE.test(params.toVendorId)) {
			return { valid: false, error: 'toVendorId must be a vendor UUID — use list_vendors to find it' };
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

		// The manager driving the conversation. Recorded on every log row so the
		// conversation view can say who sent what; absent for autonomous runs.
		const sentByUserId = context.userId;

		try {
			// Handle sending to all staff (vendors and admins are excluded)
			if (params.toAllStaff) {
				const allStaff = await getBroadcastStaff();

				// Filter to users with valid phone numbers
				const staffWithPhones = allStaff.filter(u => {
					if (!u.phone) return false;
					const formatted = formatPhoneToE164(u.phone);
					return formatted !== null;
				});

				if (staffWithPhones.length === 0) {
					return { success: false, error: 'No active staff members with valid phone numbers found' };
				}

				let successCount = 0;
				let failCount = 0;
				const errors: string[] = [];

				for (const user of staffWithPhones) {
					const formatted = formatPhoneToE164(user.phone!);
					if (!formatted) continue;

					const result = await sendSMS(formatted, params.message, { sentByUserId });
					if (result.success) {
						successCount++;
					} else {
						failCount++;
						errors.push(`${user.name}: ${result.error}`);
					}
				}

				if (successCount === 0) {
					return {
						success: false,
						error: `Failed to send SMS to any staff. Errors: ${errors.join(', ')}`
					};
				}

				return {
					success: true,
					recipientName: `all staff (${successCount} sent${failCount > 0 ? `, ${failCount} failed` : ''})`,
					recipientCount: successCount
				};
			}

			// Handle sending to every active vendor
			if (params.toAllVendors) {
				const targets = await getVendorSmsTargets({ activeOnly: true });
				if (targets.length === 0) {
					return { success: false, error: 'No active vendors found' };
				}
				return broadcastToVendors(targets, params.message, sentByUserId);
			}

			// Single vendor
			if (params.toVendorId) {
				const vendor = await getVendorSmsTarget(params.toVendorId);
				if (!vendor) {
					return { success: false, error: 'Vendor not found' };
				}
				if (!vendor.phone) {
					return {
						success: false,
						error: `${vendor.displayName} has no phone number on file. Add a contact number to the vendor record.`
					};
				}

				const formatted = formatPhoneToE164(vendor.phone);
				if (!formatted) {
					return {
						success: false,
						error: `${vendor.displayName}'s phone number "${vendor.phone}" is not in a valid format`
					};
				}

				const result = await sendSMS(formatted, params.message, {
					sentByUserId,
					vendorId: vendor.vendorId
				});

				if (!result.success) {
					return { success: false, error: result.error || 'Failed to send SMS' };
				}

				return {
					success: true,
					recipientName: vendor.displayName,
					recipientPhone: formatted,
					phoneSource: vendor.source,
					messageSid: result.sid
				};
			}

			let phoneNumber: string;
			let recipientName: string | undefined;

			if (params.toUserId) {
				// Look up user's phone number
				const user = await db
					.select({ id: users.id, name: users.name, phone: users.phone, isActive: users.isActive })
					.from(users)
					.where(eq(users.id, params.toUserId))
					.limit(1);

				if (user.length === 0) {
					return { success: false, error: 'User not found' };
				}

				if (!user[0].isActive) {
					return { success: false, error: `User ${user[0].name} is marked inactive (no longer works here) — SMS not sent` };
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
			const result = await sendSMS(phoneNumber, params.message, { sentByUserId });

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
			log.error({ error }, 'Send SMS tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: SendSMSResult): string {
		if (!result.success) {
			return `Failed to send SMS: ${result.error}`;
		}

		const skipped = result.unreachable?.length
			? ` No number on file for: ${result.unreachable.join(', ')}.`
			: '';

		if (result.recipientCount && result.recipientCount > 1) {
			return `SMS sent to ${result.recipientName}.${skipped}`;
		}

		const recipient = result.recipientName || result.recipientPhone || 'recipient';
		const via = result.phoneSource === 'vendor_record' ? ' (vendor record number)' : '';
		return `SMS sent to ${recipient}${via}.${skipped}`;
	}
};
