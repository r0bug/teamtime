/**
 * Metrics Cron API Endpoint
 *
 * Triggered by external cron to run metrics collection and correlation computation.
 * Should run daily after sales data is imported.
 *
 * POST: Trigger metrics collection and correlation computation
 *   - Requires CRON_SECRET header for authentication
 *   - Runs: metric collectors, daily correlations, weekly/monthly rollups
 *
 * Example cron setup:
 * 0 4 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/metrics/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';
import { getPacificDateParts } from '$lib/server/utils/timezone';
import { runMetricCollectors, cleanupOldMetrics } from '$lib/server/services/metrics-service';
import {
	computeDailyCorrelations,
	computeWeeklyCorrelations,
	computeMonthlyCorrelations
} from '$lib/server/services/vendor-correlation-service';
import { computeAllStaffingAnalytics } from '$lib/server/services/staffing-analytics-service';

const log = createLogger('api:metrics:cron');

// Simple secret-based auth for cron jobs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET || 'teamtime-cron-secret';

	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also check query param for simple curl testing
	const url = new URL(request.url);
	if (url.searchParams.get('secret') === cronSecret) {
		return true;
	}

	return false;
}

// POST - Trigger metrics collection and correlation computation
export const POST: RequestHandler = async ({ request, url }) => {
	// Validate request
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date();
	const pacific = getPacificDateParts(now);
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);

	const results = {
		metricCollection: { processed: false, metricsRecorded: 0, errors: [] as string[] },
		dailyCorrelations: { processed: false, correlationsComputed: 0, error: null as string | null },
		weeklyRollup: { processed: false, correlationsComputed: 0 },
		monthlyRollup: { processed: false, correlationsComputed: 0 },
		staffingAnalytics: { processed: false, pairs: 0, impact: 0, levels: 0, dayOfWeek: 0 },
		cleanup: { processed: false, recordsDeleted: 0 },
		timestamp: now.toISOString(),
		pacificTime: `${pacific.year}-${String(pacific.month).padStart(2, '0')}-${String(pacific.day).padStart(2, '0')} ${String(pacific.hour).padStart(2, '0')}:${String(pacific.minute).padStart(2, '0')}`
	};

	log.info({ timestamp: now.toISOString() }, 'Metrics cron job started');

	// Check for optional parameters
	const force = url.searchParams.get('force') === 'true';
	const skipCorrelations = url.searchParams.get('skipCorrelations') === 'true';
	const skipCleanup = url.searchParams.get('skipCleanup') === 'true';

	try {
		// 1. Run metric collectors
		try {
			log.info('Running metric collectors');
			const collectorResult = await runMetricCollectors();
			results.metricCollection.processed = true;
			results.metricCollection.metricsRecorded = collectorResult.totalMetrics;
			results.metricCollection.errors = collectorResult.errors;
			log.info({ metricsRecorded: collectorResult.totalMetrics }, 'Metric collectors completed');
		} catch (error) {
			results.metricCollection.errors.push(error instanceof Error ? error.message : 'Unknown error');
			log.error({ error }, 'Metric collectors failed');
		}

		// 2. Compute daily correlations for yesterday
		if (!skipCorrelations) {
			try {
				log.info({ date: yesterday.toISOString().split('T')[0] }, 'Computing daily correlations');
				const dailyResult = await computeDailyCorrelations(yesterday);
				results.dailyCorrelations.processed = true;
				results.dailyCorrelations.correlationsComputed = dailyResult.length;
				log.info({ correlationsComputed: dailyResult.length }, 'Daily correlations completed');
			} catch (error) {
				results.dailyCorrelations.error = error instanceof Error ? error.message : 'Unknown error';
				log.error({ error }, 'Daily correlations failed');
			}

			// 3. Compute weekly rollup on Sunday (day 0)
			if (pacific.weekday === 0 || force) {
				try {
					const weekStart = new Date(now);
					weekStart.setDate(weekStart.getDate() - 7);
					log.info({ weekStart: weekStart.toISOString().split('T')[0] }, 'Computing weekly correlations');
					const weeklyResult = await computeWeeklyCorrelations(weekStart);
					results.weeklyRollup.processed = true;
					results.weeklyRollup.correlationsComputed = weeklyResult.length;
					log.info({ correlationsComputed: weeklyResult.length }, 'Weekly correlations completed');
				} catch (error) {
					log.error({ error }, 'Weekly correlations failed');
				}
			}

			// 4. Compute monthly rollup on 1st of month
			if (pacific.day === 1 || force) {
				try {
					const monthStart = new Date(now);
					monthStart.setMonth(monthStart.getMonth() - 1);
					monthStart.setDate(1);
					log.info({ monthStart: monthStart.toISOString().split('T')[0] }, 'Computing monthly correlations');
					const monthlyResult = await computeMonthlyCorrelations(monthStart);
					results.monthlyRollup.processed = true;
					results.monthlyRollup.correlationsComputed = monthlyResult.length;
					log.info({ correlationsComputed: monthlyResult.length }, 'Monthly correlations completed');
				} catch (error) {
					log.error({ error }, 'Monthly correlations failed');
				}
			}
		}

		// 5. Compute staffing analytics (weekly on Sunday or force)
		if (!skipCorrelations && (pacific.weekday === 0 || force)) {
			try {
				const ninetyDaysAgo = new Date(now);
				ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
				log.info('Computing staffing analytics');
				const staffingResult = await computeAllStaffingAnalytics(ninetyDaysAgo, now);
				results.staffingAnalytics = {
					processed: true,
					pairs: staffingResult.pairs.pairsComputed,
					impact: staffingResult.impact.workersAnalyzed,
					levels: staffingResult.staffingLevels.levelsComputed,
					dayOfWeek: staffingResult.dayOfWeek.daysAnalyzed
				};
				log.info({ staffingResult }, 'Staffing analytics completed');
			} catch (error) {
				log.error({ error }, 'Staffing analytics computation failed');
			}
		}

		// 6. Cleanup old metrics (configurable retention, default 90 days)
		if (!skipCleanup) {
			try {
				const retentionDays = parseInt(url.searchParams.get('retentionDays') || '90', 10);
				log.info({ retentionDays }, 'Cleaning up old metrics');
				const cleanupResult = await cleanupOldMetrics(retentionDays);
				results.cleanup.processed = true;
				results.cleanup.recordsDeleted = cleanupResult.deletedCount;
				log.info({ deletedCount: cleanupResult.deletedCount }, 'Metrics cleanup completed');
			} catch (error) {
				log.error({ error }, 'Metrics cleanup failed');
			}
		}

		log.info(results, 'Metrics cron job completed');

		return json({
			success: true,
			...results
		});
	} catch (error) {
		log.error({ error, timestamp: now.toISOString() }, 'Metrics cron job error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			...results
		}, { status: 500 });
	}
};

// GET - Allow GET for simpler testing/triggering
export const GET: RequestHandler = async ({ request, url }) => {
	// Validate request
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Forward to POST handler with the same logic
	return POST({ request, url } as Parameters<RequestHandler>[0]);
};
