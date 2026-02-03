/**
 * Clock-Out Cron API Endpoint
 *
 * GET /api/clock/cron
 *
 * Called by cron job every 15 minutes to check for staff who forgot to clock out.
 * Sends SMS reminders and creates warning records.
 *
 * Authentication: CRON_SECRET via Bearer token or query param
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { checkOverdueClockOuts } from '$lib/server/services/clock-out-warning-service';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:clock:cron');

// System user ID for auto-issued demerits
// In production, this should be configured or use a specific system account
const SYSTEM_USER_ID_FALLBACK = '00000000-0000-0000-0000-000000000000';

export const GET: RequestHandler = async ({ request, url }) => {
	// Verify cron secret
	const cronSecret = env.CRON_SECRET;

	if (!cronSecret) {
		log.warn('CRON_SECRET not configured');
		return json({ error: 'Cron not configured' }, { status: 500 });
	}

	// Check Authorization header or query param
	const authHeader = request.headers.get('Authorization');
	const querySecret = url.searchParams.get('secret');

	let authenticated = false;

	if (authHeader) {
		// Bearer token
		const token = authHeader.replace(/^Bearer\s+/i, '');
		authenticated = token === cronSecret;
	} else if (querySecret) {
		authenticated = querySecret === cronSecret;
	}

	if (!authenticated) {
		log.warn('Invalid cron authentication attempt');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	log.info('Clock-out cron job starting');

	// Get system user ID - find first admin or use fallback
	let systemUserId = SYSTEM_USER_ID_FALLBACK;
	try {
		const [admin] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.role, 'admin'))
			.limit(1);

		if (admin) {
			systemUserId = admin.id;
		}
	} catch (err) {
		log.warn({ error: err }, 'Failed to find admin user, using fallback system user ID');
	}

	// Run the check
	const result = await checkOverdueClockOuts(systemUserId);

	log.info(result, 'Clock-out cron job completed');

	return json({
		success: true,
		timestamp: new Date().toISOString(),
		...result
	});
};
