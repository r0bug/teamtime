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
import { checkLateArrivals } from '$lib/server/services/late-arrival-warning-service';
import { processPendingJobs } from '$lib/server/jobs';
import { db, users } from '$lib/server/db';
import { asc, eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import {
	autoApplyDefaultTemplate,
	getScheduleTemplateConfig,
	updateScheduleTemplateConfig
} from '$lib/server/services/schedule-template-service';

const SCHEDULE_TEMPLATE_CRON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const log = createLogger('api:clock:cron');

// System user ID for auto-issued demerits
// In production, this should be configured or use a specific system account
const SYSTEM_USER_ID_FALLBACK = '00000000-0000-0000-0000-000000000000';

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret
	const cronSecret = env.CRON_SECRET;

	// SECURITY: Only accept header-based authentication - query params can leak in logs
	if (!cronSecret) {
		// In development, allow without secret
		if (process.env.NODE_ENV !== 'production') {
			log.warn('CRON_SECRET not configured - allowing unauthenticated access in development');
		} else {
			log.error('CRON_SECRET environment variable must be set in production');
			return json({ error: 'Cron not configured' }, { status: 500 });
		}
	} else {
		// Check Authorization header only (no query params for security)
		const authHeader = request.headers.get('Authorization');
		const cronSecretHeader = request.headers.get('X-Cron-Secret');

		let authenticated = false;

		if (authHeader) {
			// Bearer token
			const token = authHeader.replace(/^Bearer\s+/i, '');
			authenticated = token === cronSecret;
		} else if (cronSecretHeader) {
			// Alternative header for services that don't support Bearer auth
			authenticated = cronSecretHeader === cronSecret;
		}

		if (!authenticated) {
			log.warn('Invalid cron authentication attempt');
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
	}

	log.info('Clock-out cron job starting');

	// Get system user ID - find first admin or use fallback
	let systemUserId = SYSTEM_USER_ID_FALLBACK;
	try {
		const [admin] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.role, 'admin'))
			.orderBy(asc(users.createdAt))
			.limit(1);

		if (admin) {
			systemUserId = admin.id;
		}
	} catch (err) {
		log.warn({ error: err }, 'Failed to find admin user, using fallback system user ID');
	}

	// Run the checks — wrap each in independent try/catch so a failure in
	// one service does not cause the remaining services to be skipped.
	let clockOutResult: Awaited<ReturnType<typeof checkOverdueClockOuts>> | { error: string };
	try {
		clockOutResult = await checkOverdueClockOuts(systemUserId);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.error({ err }, 'checkOverdueClockOuts failed');
		clockOutResult = { error: msg };
	}

	let lateArrivalResult: Awaited<ReturnType<typeof checkLateArrivals>> | { error: string };
	try {
		lateArrivalResult = await checkLateArrivals(systemUserId);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.error({ err }, 'checkLateArrivals failed');
		lateArrivalResult = { error: msg };
	}

	// Process pending jobs (scheduled SMS, inventory drops, etc.)
	let jobsResult = { processed: 0, succeeded: 0, failed: 0 };
	try {
		jobsResult = await processPendingJobs(10);
		if (jobsResult.processed > 0) {
			log.info({ jobsResult }, 'Processed pending jobs');
		}
	} catch (err) {
		log.error({ error: err }, 'Failed to process pending jobs');
	}

	// Schedule template auto-apply (gated to run at most once per 24 hours)
	let scheduleTemplateResult:
		| { weeksProcessed: number; shiftsCreated: number; errors: string[] }
		| { skipped: true; reason: string }
		| { error: string } = { skipped: true, reason: 'not due' };
	try {
		const config = await getScheduleTemplateConfig();
		if (!config.enabled) {
			scheduleTemplateResult = { skipped: true, reason: 'disabled' };
		} else {
			const now = Date.now();
			const lastRun = config.cronLastRun ?? 0;
			if (now - lastRun < SCHEDULE_TEMPLATE_CRON_INTERVAL_MS) {
				scheduleTemplateResult = { skipped: true, reason: '24hr gate active' };
			} else {
				const result = await autoApplyDefaultTemplate(config.weeksAhead, systemUserId);
				await updateScheduleTemplateConfig({ cronLastRun: now });
				scheduleTemplateResult = result;
				log.info({ result }, 'Schedule template auto-apply completed');
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.error({ err }, 'Schedule template auto-apply failed');
		scheduleTemplateResult = { error: msg };
	}

	log.info({ clockOutResult, lateArrivalResult, jobsResult, scheduleTemplateResult }, 'Clock cron job completed');

	return json({
		success: true,
		timestamp: new Date().toISOString(),
		clockOutWarnings: clockOutResult,
		lateArrivals: lateArrivalResult,
		jobsProcessed: jobsResult,
		scheduleTemplate: scheduleTemplateResult
	});
};
