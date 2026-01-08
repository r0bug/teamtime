// Scheduled SMS Processor Job - sends SMS at scheduled time
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { registerHandler } from './processor';
import type { JobPayload, JobResult } from './queue';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { createLogger } from '$lib/server/logger';

const log = createLogger('jobs:scheduled-sms');

// Process scheduled SMS job
async function processScheduledSMS(
	payload: JobPayload['scheduled_sms']
): Promise<JobResult['scheduled_sms']> {
	const { toUserId, toPhone, toAllStaff, message, scheduledBy } = payload;

	log.info('Processing scheduled SMS', { toUserId, toPhone, toAllStaff, scheduledBy });

	// Handle sending to all staff
	if (toAllStaff) {
		const allStaff = await db
			.select({ id: users.id, name: users.name, phone: users.phone, role: users.role })
			.from(users)
			.where(eq(users.isActive, true));

		// Filter to non-admin users with valid phone numbers
		const staffWithPhones = allStaff.filter((u) => {
			if (u.role === 'admin') return false;
			if (!u.phone) return false;
			return formatPhoneToE164(u.phone) !== null;
		});

		if (staffWithPhones.length === 0) {
			log.warn('No active staff with valid phone numbers found');
			return { success: false, error: 'No active staff with valid phone numbers found' };
		}

		let successCount = 0;
		let failCount = 0;
		const errors: string[] = [];

		for (const user of staffWithPhones) {
			const formatted = formatPhoneToE164(user.phone!);
			if (!formatted) continue;

			const result = await sendSMS(formatted, message);
			if (result.success) {
				successCount++;
			} else {
				failCount++;
				errors.push(`${user.name}: ${result.error}`);
			}
		}

		if (successCount === 0) {
			log.error('Failed to send SMS to any staff', { errors });
			return {
				success: false,
				error: `Failed to send SMS to any staff. Errors: ${errors.join(', ')}`
			};
		}

		log.info('Scheduled SMS sent to all staff', { successCount, failCount });
		return {
			success: true,
			recipientCount: successCount,
			recipientName: `all staff (${successCount} sent${failCount > 0 ? `, ${failCount} failed` : ''})`
		};
	}

	// Single recipient
	let phoneNumber: string;
	let recipientName: string | undefined;

	if (toUserId) {
		const [user] = await db
			.select({ name: users.name, phone: users.phone })
			.from(users)
			.where(eq(users.id, toUserId))
			.limit(1);

		if (!user) {
			log.error('User not found for scheduled SMS', { toUserId });
			return { success: false, error: 'User not found' };
		}

		if (!user.phone) {
			log.error('User has no phone number', { toUserId, userName: user.name });
			return { success: false, error: `User ${user.name} has no phone number on file` };
		}

		const formatted = formatPhoneToE164(user.phone);
		if (!formatted) {
			log.error('Invalid phone number format', { phone: user.phone });
			return { success: false, error: `User's phone number "${user.phone}" is not in a valid format` };
		}

		phoneNumber = formatted;
		recipientName = user.name;
	} else if (toPhone) {
		const formatted = formatPhoneToE164(toPhone);
		if (!formatted) {
			log.error('Invalid phone number format', { toPhone });
			return { success: false, error: 'Invalid phone number format' };
		}
		phoneNumber = formatted;
	} else {
		log.error('No recipient specified for scheduled SMS');
		return { success: false, error: 'No recipient specified' };
	}

	// Send the SMS
	const result = await sendSMS(phoneNumber, message);

	if (!result.success) {
		log.error('Failed to send scheduled SMS', { error: result.error, phoneNumber });
		return {
			success: false,
			error: result.error || 'Failed to send SMS'
		};
	}

	log.info('Scheduled SMS sent successfully', { recipientName, phoneNumber, sid: result.sid });
	return {
		success: true,
		recipientName,
		messageSid: result.sid
	};
}

// Register the handler
registerHandler('scheduled_sms', processScheduledSMS);

// Export for explicit registration
export { processScheduledSMS };
