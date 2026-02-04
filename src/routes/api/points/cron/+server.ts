/**
 * Points/Gamification Cron Endpoint
 *
 * Handles daily gamification tasks:
 * - Process sales attribution for yesterday
 * - Reset weekly points (on Sunday)
 * - Reset monthly points (on 1st of month)
 *
 * Should be called daily around 2-3 AM Pacific via external cron.
 *
 * Example cron setup:
 * 0 3 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/points/cron
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, userStats } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { processYesterdaySalesPoints, hasSalesPointsBeenProcessed } from '$lib/server/services/sales-attribution-service';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';
import { getPacificDateParts } from '$lib/server/utils/timezone';

const log = createLogger('api:points:cron');

// Simple secret-based auth for cron jobs
// SECURITY: Only accepts Authorization header - query params can leak in logs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET;

	// Require a proper secret to be configured
	if (!cronSecret || cronSecret === 'teamtime-cron-secret') {
		// In development, allow requests without auth if no secret is configured
		if (process.env.NODE_ENV !== 'production') {
			log.warn('CRON_SECRET not configured - allowing unauthenticated access in development');
			return true;
		}
		log.error('CRON_SECRET environment variable must be set in production');
		return false;
	}

	// Validate Bearer token
	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also accept X-Cron-Secret header for services that don't support Bearer auth
	const cronSecretHeader = request.headers.get('X-Cron-Secret');
	if (cronSecretHeader === cronSecret) {
		return true;
	}

	return false;
}

export const GET: RequestHandler = async ({ request }) => {
	// Validate request
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date();
	const pacific = getPacificDateParts(now);
	const results = {
		salesAttribution: { processed: false, data: null as unknown, error: null as string | null },
		weeklyReset: { processed: false, count: 0 },
		monthlyReset: { processed: false, count: 0 },
		timestamp: now.toISOString(),
		pacificTime: `${pacific.year}-${String(pacific.month).padStart(2, '0')}-${String(pacific.day).padStart(2, '0')} ${String(pacific.hour).padStart(2, '0')}:${String(pacific.minute).padStart(2, '0')}`
	};

	log.info({ timestamp: now.toISOString() }, 'Points cron job running');

	try {
		// 1. Process yesterday's sales attribution
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().split('T')[0];

		// Check if already processed
		const alreadyProcessed = await hasSalesPointsBeenProcessed(yesterdayStr);
		if (alreadyProcessed) {
			log.info({ date: yesterdayStr }, 'Sales points already processed for this date');
			results.salesAttribution.processed = false;
		} else {
			try {
				const salesResult = await processYesterdaySalesPoints();
				results.salesAttribution.processed = true;
				results.salesAttribution.data = salesResult;
				log.info({ date: yesterdayStr, result: salesResult }, 'Sales attribution processed');
			} catch (error) {
				results.salesAttribution.error = error instanceof Error ? error.message : 'Unknown error';
				log.error({ error, date: yesterdayStr }, 'Error processing sales attribution');
			}
		}

		// 2. Reset weekly points on Sunday (day 0)
		if (pacific.weekday === 0) {
			const resetResult = await db
				.update(userStats)
				.set({
					weeklyPoints: 0,
					updatedAt: now
				})
				.returning({ id: userStats.id });

			results.weeklyReset.processed = true;
			results.weeklyReset.count = resetResult.length;
			log.info({ count: resetResult.length }, 'Weekly points reset');
		}

		// 3. Reset monthly points on 1st of month
		if (pacific.day === 1) {
			const resetResult = await db
				.update(userStats)
				.set({
					monthlyPoints: 0,
					updatedAt: now
				})
				.returning({ id: userStats.id });

			results.monthlyReset.processed = true;
			results.monthlyReset.count = resetResult.length;
			log.info({ count: resetResult.length }, 'Monthly points reset');
		}

		log.info(results, 'Points cron job completed');

		return json({
			success: true,
			...results
		});
	} catch (error) {
		log.error({ error, timestamp: now.toISOString() }, 'Points cron job error');
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				...results
			},
			{ status: 500 }
		);
	}
};
