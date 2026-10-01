/**
 * Clock-Out Cron API Endpoint
 *
 * GET /api/clock/cron
 *
 * Called by cron job every 15 minutes. Sends the single clock-out reminder and,
 * on a later pass, closes still-open entries at their scheduled shift end.
 * Also drains the job queue, expires shift-coverage requests, and applies the
 * default schedule template once a day.
 *
 * Late-arrival warnings and the demerit engine are switched off by default —
 * see attendance-policy-service.
 *
 * Authentication: CRON_SECRET via Bearer token or query param
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { checkOverdueClockOuts } from '$lib/server/services/clock-out-warning-service';
import { checkLateArrivals } from '$lib/server/services/late-arrival-warning-service';
import { getAttendancePolicyConfig } from '$lib/server/services/attendance-policy-service';
import { resolveSystemUserId } from '$lib/server/services/system-user';
import { processPendingJobs } from '$lib/server/jobs';
import { expireStaleRequests } from '$lib/server/services/shift-coverage-service';
import { createLogger } from '$lib/server/logger';
import {
	autoApplyDefaultTemplate,
	getScheduleTemplateConfig,
	updateScheduleTemplateConfig
} from '$lib/server/services/schedule-template-service';

const SCHEDULE_TEMPLATE_CRON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const log = createLogger('api:clock:cron');

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

	// Automated writes still need a real actor for the FK columns.
	const systemUserId = await resolveSystemUserId();
	if (!systemUserId) {
		log.error('No system user and no admin users exist — cannot run cron');
		return json({ error: 'No system or admin user configured' }, { status: 500 });
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

	// Expire shift coverage requests whose response deadline has passed and
	// escalate them to managers. Piggybacks this cron rather than adding a
	// crontab entry; note it therefore only runs during business hours.
	let coverageExpiredResult: { expired: number } | { error: string };
	try {
		coverageExpiredResult = { expired: await expireStaleRequests() };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.error({ err }, 'expireStaleRequests failed');
		coverageExpiredResult = { error: msg };
	}

	// Schedule template auto-apply (gated to run at most once per 24 hours)
	let scheduleTemplateResult:
		| { weeksProcessed: number; shiftsCreated: number; weeksSkipped: number; errors: string[] }
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

	// Surface the attendance switches in the response so "why didn't anyone get
	// warned?" is answerable from a single cron hit.
	const attendancePolicy = await getAttendancePolicyConfig().catch(() => null);

	log.info(
		{ clockOutResult, lateArrivalResult, jobsResult, coverageExpiredResult, scheduleTemplateResult },
		'Clock cron job completed'
	);

	return json({
		success: true,
		timestamp: new Date().toISOString(),
		attendancePolicy,
		clockOutWarnings: clockOutResult,
		lateArrivals: lateArrivalResult,
		jobsProcessed: jobsResult,
		shiftCoverage: coverageExpiredResult,
		scheduleTemplate: scheduleTemplateResult
	});
};
