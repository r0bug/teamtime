import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, vendors } from '$lib/server/db/schema';
import { createResetToken } from '$lib/server/auth/password-reset';
import { sendPasswordResetLinkEmail } from '$lib/server/email';
import { sendSMS, formatPhoneToE164, isTwilioConfigured } from '$lib/server/twilio';
import { createLogger } from '$lib/server/logger';

const log = createLogger('routes:forgot-password');

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().toLowerCase().trim();
		if (!email) return fail(400, { error: 'Email is required' });

		try {
			// Only vendor-portal users sign in with a password, so only they get a
			// reset link. Pull a phone from the user record or the linked vendor.
			const [row] = await db
				.select({
					userId: users.id,
					isActive: users.isActive,
					userPhone: users.phone,
					vendorPhone: vendors.contactPhone,
					portalEnabled: vendors.portalEnabled
				})
				.from(users)
				.leftJoin(vendors, eq(vendors.userId, users.id))
				.where(eq(users.email, email))
				.limit(1);

			if (row && row.isActive && row.portalEnabled) {
				const token = await createResetToken(row.userId);
				const resetUrl = `${url.origin}/reset-password?token=${token}`;

				await sendPasswordResetLinkEmail(email, resetUrl);

				const phoneRaw = row.userPhone ?? row.vendorPhone;
				const phone = phoneRaw ? formatPhoneToE164(phoneRaw) : null;
				if (phone && isTwilioConfigured()) {
					await sendSMS(phone, `Reset your TeamTime password (link expires in 30 min): ${resetUrl}`);
				}
			}
		} catch (err) {
			// Never reveal failures to the caller — log and fall through to success.
			log.error({ err: String(err) }, 'forgot-password processing failed');
		}

		// Blunt enumeration/timing signals.
		await new Promise((r) => setTimeout(r, 500));
		return { success: true };
	}
};
