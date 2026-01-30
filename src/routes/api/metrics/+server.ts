/**
 * Metrics API Endpoint
 *
 * Query metrics with filters, dimensions, and aggregation support.
 * GET: Query metrics with filters (type, dimensions, dateRange, groupBy)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '$lib/server/logger';
import { queryMetrics } from '$lib/server/services/metrics-service';

const log = createLogger('api:metrics');

// GET - Query metrics with filters
export const GET: RequestHandler = async ({ locals, url }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Parse query parameters
		const metricType = url.searchParams.get('type');
		const metricKey = url.searchParams.get('key');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const groupBy = url.searchParams.get('groupBy'); // Comma-separated: user_id,vendor_id
		const source = url.searchParams.get('source');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		// Parse dimensions filter from JSON query param
		let dimensions: Record<string, string> | undefined;
		const dimensionsParam = url.searchParams.get('dimensions');
		if (dimensionsParam) {
			try {
				dimensions = JSON.parse(dimensionsParam);
			} catch {
				return json({ success: false, error: 'Invalid dimensions JSON' }, { status: 400 });
			}
		}

		// Parse aggregation type
		const aggregation = url.searchParams.get('aggregation') as 'sum' | 'avg' | 'min' | 'max' | 'count' | null;

		log.debug({
			metricType,
			metricKey,
			startDate,
			endDate,
			groupBy,
			dimensions,
			limit,
			offset,
			userId: locals.user.id
		}, 'Metrics query request');

		// Build filter options
		const validSources = ['teamtime', 'lob_scraper', 'api', 'manual', 'computed'] as const;
		const sourceValue = source && validSources.includes(source as typeof validSources[number])
			? (source as typeof validSources[number])
			: undefined;

		const filters = {
			metricType: metricType || undefined,
			metricKey: metricKey || undefined,
			startDate: startDate ? new Date(startDate) : undefined,
			endDate: endDate ? new Date(endDate) : undefined,
			source: sourceValue,
			dimensions,
			limit,
			offset
		};

		// Build groupBy array
		const groupByFields = groupBy ? groupBy.split(',').map(s => s.trim()) : undefined;

		const result = await queryMetrics(filters, {
			groupBy: groupByFields,
			aggregation: aggregation || undefined
		});

		return json({
			success: true,
			...result
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Metrics query error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
