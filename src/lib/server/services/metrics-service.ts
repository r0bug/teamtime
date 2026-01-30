/**
 * @module Services/Metrics
 * @description Core metrics service for recording and querying metrics.
 *
 * This service provides a generic framework for collecting, storing, and
 * querying metrics from any source. It supports:
 * - Recording individual metrics and batch inserts
 * - Flexible querying with dimension filtering
 * - Aggregation support (sum, avg, min, max, count)
 * - Metric definition registry for self-documenting metrics
 *
 * @see {@link $lib/server/services/metric-collectors/types} for collector interfaces
 */

import {
	db,
	metrics,
	metricDefinitions
} from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import type { Metric, NewMetric, MetricDefinition, NewMetricDefinition } from '$lib/server/db/schema';
import type { MetricPeriodType, CollectedMetric } from './metric-collectors/types';

const log = createLogger('server:metrics-service');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Aggregation types supported for metric queries.
 */
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'last';

/**
 * Filters for querying metrics.
 */
/** Valid metric source types */
export type MetricSourceType = 'teamtime' | 'lob_scraper' | 'api' | 'manual' | 'computed';

export interface MetricQueryFilters {
	/** Filter by metric type */
	type?: string;
	/** Filter by dimensions (key-value pairs) */
	dimensions?: Record<string, string>;
	/** Filter by period type */
	periodType?: MetricPeriodType;
	/** Filter by date range */
	dateRange?: {
		start: Date;
		end: Date;
	};
	/** Filter by source */
	source?: MetricSourceType;
	/** Filter by metric keys */
	metricKeys?: string[];
}

/**
 * Options for metric query results.
 */
export interface MetricQueryOptions {
	/** Group results by dimension key */
	groupBy?: string | string[];
	/** Aggregation function to apply */
	aggregation?: AggregationType;
	/** Maximum number of results */
	limit?: number;
	/** Number of results to skip */
	offset?: number;
	/** Order by field and direction */
	orderBy?: {
		field: 'value' | 'periodStart' | 'createdAt';
		direction: 'asc' | 'desc';
	};
}

/**
 * Result from a metric query with aggregation.
 */
export interface AggregatedMetricResult {
	/** Dimension values (when grouped) */
	dimensions: Record<string, string>;
	/** Aggregated value */
	value: number;
	/** Count of records aggregated */
	count: number;
	/** Minimum value (when using avg aggregation) */
	min?: number;
	/** Maximum value (when using avg aggregation) */
	max?: number;
}

/**
 * Summary of metrics for a given type and date range.
 */
export interface MetricSummary {
	metricType: string;
	totalValue: number;
	count: number;
	avgValue: number;
	minValue: number;
	maxValue: number;
	byDimension?: Record<string, number>;
}

/**
 * Parameters for recording a single metric.
 */
export interface RecordMetricParams {
	/** Metric type (should match a metric definition) */
	type: string;
	/** Unique key within the metric type */
	key: string;
	/** The metric value */
	value: number;
	/** Dimensions for filtering/grouping */
	dimensions?: Record<string, string>;
	/** Period type for aggregation */
	periodType: MetricPeriodType;
	/** Start of the measurement period */
	periodStart: Date;
	/** End of the measurement period */
	periodEnd: Date;
	/** Source system that produced this metric */
	source: MetricSourceType;
	/** Optional ID linking to source record */
	sourceId?: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Parameters for registering a metric definition.
 */
export interface MetricDefinitionParams {
	metricType: string;
	displayName: string;
	description?: string;
	unit?: string;
	aggregation?: AggregationType;
	availableDimensions: string[];
	sourceTypes: string[];
	isActive?: boolean;
	metadata?: Record<string, unknown>;
}

// ============================================================================
// RECORD METRICS
// ============================================================================

/**
 * Record a single metric.
 *
 * @param params - The metric parameters
 * @returns The created metric record
 *
 * @example
 * ```typescript
 * const metric = await recordMetric({
 *   type: 'vendor_daily_sales',
 *   key: 'vendor-123',
 *   value: 1500.00,
 *   dimensions: { vendorId: 'vendor-123', locationId: 'loc-1' },
 *   periodType: 'daily',
 *   periodStart: new Date('2025-01-28'),
 *   periodEnd: new Date('2025-01-29'),
 *   source: 'lob_scraper'
 * });
 * ```
 */
export async function recordMetric(params: RecordMetricParams): Promise<Metric> {
	const {
		type,
		key,
		value,
		dimensions = {},
		periodType,
		periodStart,
		periodEnd,
		source,
		sourceId,
		metadata = {}
	} = params;

	log.debug(
		{ metricType: type, metricKey: key, value, periodType, source },
		'Recording metric'
	);

	const [metric] = await db
		.insert(metrics)
		.values({
			metricType: type,
			metricKey: key,
			value: value.toString(),
			dimensions,
			periodType,
			periodStart,
			periodEnd,
			source,
			sourceId,
			metadata
		})
		.returning();

	log.info(
		{ metricId: metric.id, metricType: type, metricKey: key },
		'Metric recorded'
	);

	return metric;
}

/**
 * Record multiple metrics in a single batch operation.
 *
 * @param metricsToInsert - Array of metrics to insert
 * @returns Array of created metric records
 *
 * @example
 * ```typescript
 * const results = await recordMetricsBatch([
 *   { type: 'task_completion', key: 'user-1', value: 5, ... },
 *   { type: 'task_completion', key: 'user-2', value: 3, ... }
 * ]);
 * ```
 */
export async function recordMetricsBatch(
	metricsToInsert: RecordMetricParams[]
): Promise<Metric[]> {
	if (metricsToInsert.length === 0) {
		log.debug('No metrics to insert in batch');
		return [];
	}

	log.debug({ count: metricsToInsert.length }, 'Recording metrics batch');

	const values: NewMetric[] = metricsToInsert.map((m) => ({
		metricType: m.type,
		metricKey: m.key,
		value: m.value.toString(),
		dimensions: m.dimensions || {},
		periodType: m.periodType,
		periodStart: m.periodStart,
		periodEnd: m.periodEnd,
		source: m.source,
		sourceId: m.sourceId,
		metadata: m.metadata || {}
	}));

	const inserted = await db.insert(metrics).values(values).returning();

	log.info(
		{ count: inserted.length },
		'Metrics batch recorded'
	);

	return inserted;
}

/**
 * Record metrics from collectors (convenience wrapper).
 *
 * @param collectedMetrics - Array of collected metrics from collectors
 * @returns Array of created metric records
 */
export async function recordCollectedMetrics(
	collectedMetrics: CollectedMetric[]
): Promise<Metric[]> {
	const params: RecordMetricParams[] = collectedMetrics.map((m) => ({
		type: m.metricType,
		key: m.metricKey,
		value: m.value,
		dimensions: m.dimensions,
		periodType: m.periodType,
		periodStart: m.periodStart,
		periodEnd: m.periodEnd,
		source: m.source as MetricSourceType,
		sourceId: m.sourceId,
		metadata: m.metadata
	}));

	return recordMetricsBatch(params);
}

// ============================================================================
// QUERY METRICS
// ============================================================================

/**
 * Query metrics with flexible filtering and aggregation.
 *
 * @param filters - Filters to apply to the query
 * @param options - Query options (grouping, aggregation, pagination)
 * @returns Array of metrics or aggregated results
 *
 * @example
 * ```typescript
 * // Get raw metrics
 * const rawMetrics = await queryMetrics(
 *   { type: 'vendor_daily_sales', dateRange: { start, end } }
 * );
 *
 * // Get aggregated metrics grouped by user
 * const aggregated = await queryMetrics(
 *   { type: 'task_completion', periodType: 'daily' },
 *   { groupBy: 'userId', aggregation: 'sum' }
 * );
 * ```
 */
export async function queryMetrics(
	filters: MetricQueryFilters,
	options: MetricQueryOptions = {}
): Promise<Metric[] | AggregatedMetricResult[]> {
	const { type, dimensions, periodType, dateRange, source, metricKeys } = filters;
	const { groupBy, aggregation, limit, offset, orderBy } = options;

	log.debug({ filters, options }, 'Querying metrics');

	// Build conditions array
	const conditions: ReturnType<typeof eq>[] = [];

	if (type) {
		conditions.push(eq(metrics.metricType, type));
	}

	if (periodType) {
		conditions.push(eq(metrics.periodType, periodType));
	}

	if (source) {
		conditions.push(eq(metrics.source, source));
	}

	if (dateRange) {
		conditions.push(gte(metrics.periodStart, dateRange.start));
		conditions.push(lte(metrics.periodEnd, dateRange.end));
	}

	if (metricKeys && metricKeys.length > 0) {
		conditions.push(inArray(metrics.metricKey, metricKeys));
	}

	// Handle dimension filters using raw SQL for JSONB
	if (dimensions && Object.keys(dimensions).length > 0) {
		for (const [key, value] of Object.entries(dimensions)) {
			conditions.push(
				sql`${metrics.dimensions}->>${key} = ${value}`
			);
		}
	}

	// If groupBy and aggregation are specified, return aggregated results
	if (groupBy && aggregation) {
		return queryMetricsAggregated(conditions, groupBy, aggregation, limit, offset);
	}

	// Otherwise, return raw metrics
	let query = db.select().from(metrics);

	if (conditions.length > 0) {
		query = query.where(and(...conditions)) as typeof query;
	}

	// Apply ordering
	if (orderBy) {
		const orderField = orderBy.field === 'value'
			? metrics.value
			: orderBy.field === 'periodStart'
				? metrics.periodStart
				: metrics.createdAt;

		query = query.orderBy(
			orderBy.direction === 'desc' ? sql`${orderField} DESC` : sql`${orderField} ASC`
		) as typeof query;
	} else {
		query = query.orderBy(sql`${metrics.periodStart} DESC`) as typeof query;
	}

	if (limit) {
		query = query.limit(limit) as typeof query;
	}

	if (offset) {
		query = query.offset(offset) as typeof query;
	}

	const results = await query;

	log.debug({ count: results.length }, 'Metrics query completed');

	return results;
}

/**
 * Internal function to handle aggregated queries.
 */
async function queryMetricsAggregated(
	conditions: ReturnType<typeof eq>[],
	groupBy: string | string[],
	aggregation: AggregationType,
	limit?: number,
	offset?: number
): Promise<AggregatedMetricResult[]> {
	const groupByKeys = Array.isArray(groupBy) ? groupBy : [groupBy];

	// Build the aggregation expression
	let aggExpr: ReturnType<typeof sql>;
	switch (aggregation) {
		case 'sum':
			aggExpr = sql<number>`SUM(CAST(${metrics.value} AS NUMERIC))`;
			break;
		case 'avg':
			aggExpr = sql<number>`AVG(CAST(${metrics.value} AS NUMERIC))`;
			break;
		case 'min':
			aggExpr = sql<number>`MIN(CAST(${metrics.value} AS NUMERIC))`;
			break;
		case 'max':
			aggExpr = sql<number>`MAX(CAST(${metrics.value} AS NUMERIC))`;
			break;
		case 'count':
			aggExpr = sql<number>`COUNT(*)`;
			break;
		case 'last':
			// For 'last', we'll use a subquery pattern
			aggExpr = sql<number>`(SELECT CAST(value AS NUMERIC) FROM metrics m2 WHERE m2.metric_type = metrics.metric_type AND m2.metric_key = metrics.metric_key ORDER BY m2.period_start DESC LIMIT 1)`;
			break;
		default:
			aggExpr = sql<number>`SUM(CAST(${metrics.value} AS NUMERIC))`;
	}

	// Build group by expressions for dimensions
	const groupByExprs = groupByKeys.map(key => sql`${metrics.dimensions}->>${key}`);
	const selectExprs = groupByKeys.map(key => sql`${metrics.dimensions}->>${key} as ${sql.raw(`"${key}"`)}`);

	// Build the query
	const baseQuery = db
		.select({
			...Object.fromEntries(groupByKeys.map(key => [key, sql`${metrics.dimensions}->>${key}`])),
			value: aggExpr,
			count: sql<number>`COUNT(*)`
		})
		.from(metrics);

	let query = conditions.length > 0
		? baseQuery.where(and(...conditions))
		: baseQuery;

	query = query.groupBy(...groupByExprs) as typeof query;

	if (limit) {
		query = query.limit(limit) as typeof query;
	}

	if (offset) {
		query = query.offset(offset) as typeof query;
	}

	const results = await query;

	// Transform results to AggregatedMetricResult format
	return results.map((row) => {
		const dimensions: Record<string, string> = {};
		for (const key of groupByKeys) {
			dimensions[key] = (row as Record<string, unknown>)[key] as string || '';
		}

		return {
			dimensions,
			value: Number((row as Record<string, unknown>).value) || 0,
			count: Number((row as Record<string, unknown>).count) || 0
		};
	});
}

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

/**
 * Get all metric definitions.
 *
 * @param activeOnly - If true, only return active definitions (default: true)
 * @returns Array of metric definitions
 */
export async function getMetricDefinitions(activeOnly = true): Promise<MetricDefinition[]> {
	log.debug({ activeOnly }, 'Getting metric definitions');

	let query = db.select().from(metricDefinitions);

	if (activeOnly) {
		query = query.where(eq(metricDefinitions.isActive, true)) as typeof query;
	}

	const results = await query.orderBy(metricDefinitions.displayName);

	log.debug({ count: results.length }, 'Metric definitions retrieved');

	return results;
}

/**
 * Get a single metric definition by type.
 *
 * @param metricType - The metric type to look up
 * @returns The metric definition or null if not found
 */
export async function getMetricDefinition(metricType: string): Promise<MetricDefinition | null> {
	log.debug({ metricType }, 'Getting metric definition');

	const [definition] = await db
		.select()
		.from(metricDefinitions)
		.where(eq(metricDefinitions.metricType, metricType))
		.limit(1);

	return definition || null;
}

/**
 * Register a metric definition (upsert).
 *
 * @param definition - The metric definition to register
 * @returns The created or updated metric definition
 *
 * @example
 * ```typescript
 * const definition = await registerMetricDefinition({
 *   metricType: 'vendor_daily_sales',
 *   displayName: 'Vendor Daily Sales',
 *   description: 'Total sales by vendor per day',
 *   unit: '$',
 *   aggregation: 'sum',
 *   availableDimensions: ['vendorId', 'locationId'],
 *   sourceTypes: ['lob_scraper']
 * });
 * ```
 */
export async function registerMetricDefinition(
	definition: MetricDefinitionParams
): Promise<MetricDefinition> {
	const {
		metricType,
		displayName,
		description,
		unit,
		aggregation = 'sum',
		availableDimensions,
		sourceTypes,
		isActive = true,
		metadata = {}
	} = definition;

	log.debug({ metricType, displayName }, 'Registering metric definition');

	// Check if definition exists
	const existing = await getMetricDefinition(metricType);

	if (existing) {
		// Update existing definition
		const [updated] = await db
			.update(metricDefinitions)
			.set({
				displayName,
				description,
				unit,
				aggregation,
				availableDimensions,
				sourceTypes,
				isActive,
				metadata,
				updatedAt: new Date()
			})
			.where(eq(metricDefinitions.metricType, metricType))
			.returning();

		log.info({ metricType }, 'Metric definition updated');
		return updated;
	}

	// Create new definition
	const [created] = await db
		.insert(metricDefinitions)
		.values({
			metricType,
			displayName,
			description,
			unit,
			aggregation,
			availableDimensions,
			sourceTypes,
			isActive,
			metadata
		})
		.returning();

	log.info({ metricType }, 'Metric definition created');
	return created;
}

// ============================================================================
// METRIC SUMMARIES
// ============================================================================

/**
 * Get an aggregated summary of metrics for a given type and date range.
 *
 * @param metricType - The metric type to summarize
 * @param dateRange - The date range to summarize
 * @param groupByDimension - Optional dimension to group by for breakdown
 * @returns Metric summary with totals and optional breakdown
 *
 * @example
 * ```typescript
 * const summary = await getMetricSummary(
 *   'vendor_daily_sales',
 *   { start: new Date('2025-01-01'), end: new Date('2025-01-31') },
 *   'vendorId'
 * );
 * // Returns: { metricType, totalValue, count, avgValue, minValue, maxValue, byDimension: { 'vendor-1': 5000, ... } }
 * ```
 */
export async function getMetricSummary(
	metricType: string,
	dateRange: { start: Date; end: Date },
	groupByDimension?: string
): Promise<MetricSummary> {
	log.debug({ metricType, dateRange, groupByDimension }, 'Getting metric summary');

	// Get overall aggregates
	const [totals] = await db
		.select({
			totalValue: sql<number>`SUM(CAST(${metrics.value} AS NUMERIC))`,
			count: sql<number>`COUNT(*)`,
			avgValue: sql<number>`AVG(CAST(${metrics.value} AS NUMERIC))`,
			minValue: sql<number>`MIN(CAST(${metrics.value} AS NUMERIC))`,
			maxValue: sql<number>`MAX(CAST(${metrics.value} AS NUMERIC))`
		})
		.from(metrics)
		.where(
			and(
				eq(metrics.metricType, metricType),
				gte(metrics.periodStart, dateRange.start),
				lte(metrics.periodEnd, dateRange.end)
			)
		);

	const summary: MetricSummary = {
		metricType,
		totalValue: Number(totals?.totalValue) || 0,
		count: Number(totals?.count) || 0,
		avgValue: Number(totals?.avgValue) || 0,
		minValue: Number(totals?.minValue) || 0,
		maxValue: Number(totals?.maxValue) || 0
	};

	// If groupByDimension is specified, get breakdown
	if (groupByDimension) {
		const breakdown = await db
			.select({
				dimensionValue: sql<string>`${metrics.dimensions}->>${groupByDimension}`,
				total: sql<number>`SUM(CAST(${metrics.value} AS NUMERIC))`
			})
			.from(metrics)
			.where(
				and(
					eq(metrics.metricType, metricType),
					gte(metrics.periodStart, dateRange.start),
					lte(metrics.periodEnd, dateRange.end)
				)
			)
			.groupBy(sql`${metrics.dimensions}->>${groupByDimension}`);

		summary.byDimension = {};
		for (const row of breakdown) {
			const key = row.dimensionValue || 'unknown';
			summary.byDimension[key] = Number(row.total) || 0;
		}
	}

	log.debug({ summary }, 'Metric summary retrieved');

	return summary;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Delete metrics older than a specified date.
 * Use with caution - metrics are typically immutable.
 *
 * @param beforeDate - Delete metrics with periodEnd before this date
 * @param metricType - Optional: only delete metrics of this type
 * @returns Number of deleted records
 */
export async function purgeOldMetrics(
	beforeDate: Date,
	metricType?: string
): Promise<number> {
	log.warn({ beforeDate, metricType }, 'Purging old metrics');

	const conditions: ReturnType<typeof eq>[] = [
		sql`${metrics.periodEnd} < ${beforeDate}`
	];

	if (metricType) {
		conditions.push(eq(metrics.metricType, metricType));
	}

	const result = await db
		.delete(metrics)
		.where(and(...conditions))
		.returning({ id: metrics.id });

	const count = result.length;

	log.info({ count, beforeDate, metricType }, 'Old metrics purged');

	return count;
}

/**
 * Get the latest metric value for a given type and key.
 *
 * @param metricType - The metric type
 * @param metricKey - The metric key
 * @returns The most recent metric or null
 */
export async function getLatestMetric(
	metricType: string,
	metricKey: string
): Promise<Metric | null> {
	const [metric] = await db
		.select()
		.from(metrics)
		.where(
			and(
				eq(metrics.metricType, metricType),
				eq(metrics.metricKey, metricKey)
			)
		)
		.orderBy(sql`${metrics.periodStart} DESC`)
		.limit(1);

	return metric || null;
}

/**
 * Check if a metric has already been recorded for a specific period.
 * Useful for preventing duplicate metric collection.
 *
 * @param metricType - The metric type
 * @param metricKey - The metric key
 * @param periodStart - The period start time
 * @param periodType - The period type
 * @returns True if metric exists
 */
export async function metricExists(
	metricType: string,
	metricKey: string,
	periodStart: Date,
	periodType: MetricPeriodType
): Promise<boolean> {
	const [existing] = await db
		.select({ id: metrics.id })
		.from(metrics)
		.where(
			and(
				eq(metrics.metricType, metricType),
				eq(metrics.metricKey, metricKey),
				eq(metrics.periodStart, periodStart),
				eq(metrics.periodType, periodType)
			)
		)
		.limit(1);

	return !!existing;
}

// ============================================================================
// METRIC COLLECTION & CLEANUP
// ============================================================================

/**
 * Run all registered metric collectors.
 * This function is called by the cron job to collect metrics from various sources.
 *
 * @returns Results of metric collection
 */
export async function runMetricCollectors(): Promise<{
	totalMetrics: number;
	errors: string[];
	collectorResults: Array<{ name: string; metricsRecorded: number; error?: string }>;
}> {
	log.info('Running all metric collectors');

	const results = {
		totalMetrics: 0,
		errors: [] as string[],
		collectorResults: [] as Array<{ name: string; metricsRecorded: number; error?: string }>
	};

	try {
		// Import collectors dynamically to avoid circular deps
		const { runAllCollectors } = await import('./metric-collectors');

		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const collectionResult = await runAllCollectors({
			start: yesterday,
			end: today
		});

		// Record all collected metrics
		if (collectionResult.metrics.length > 0) {
			const recorded = await recordCollectedMetrics(collectionResult.metrics);
			results.totalMetrics = recorded.length;
		}

		// Add error info from collectors
		for (const [name, info] of Object.entries(collectionResult.byCollector)) {
			results.collectorResults.push({
				name,
				metricsRecorded: info.metricsCount,
				error: info.errors.length > 0 ? info.errors.join('; ') : undefined
			});
			results.errors.push(...info.errors);
		}

		log.info({ totalMetrics: results.totalMetrics }, 'Metric collectors completed');
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown collector error';
		results.errors.push(errorMsg);
		log.error({ error }, 'Error running metric collectors');
	}

	return results;
}

/**
 * Clean up old metrics based on retention policy.
 *
 * @param retentionDays - Number of days to retain metrics (default: 90)
 * @returns Count of deleted records
 */
export async function cleanupOldMetrics(retentionDays = 90): Promise<{
	deletedCount: number;
}> {
	log.info({ retentionDays }, 'Cleaning up old metrics');

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

	const deletedCount = await purgeOldMetrics(cutoffDate);

	log.info({ deletedCount, retentionDays }, 'Metrics cleanup completed');

	return { deletedCount };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

interface ReportParams {
	dateRange: { start: Date; end: Date };
	userId?: string | null;
	vendorId?: string | null;
	groupBy?: 'day' | 'week' | 'month';
}

/**
 * Generate vendor-by-employee report showing sales breakdown.
 */
export async function generateVendorByEmployeeReport(params: ReportParams): Promise<{
	data: Record<string, unknown>[];
}> {
	const { dateRange, vendorId } = params;
	log.debug({ dateRange, vendorId }, 'Generating vendor-by-employee report');

	// Query metrics with vendor and employee dimensions
	const results = await queryMetrics(
		{
			type: 'vendor_daily_sales',
			dateRange,
			...(vendorId && { dimensions: { vendorId } })
		},
		{ limit: 1000 }
	) as Metric[];

	// Aggregate by employee and vendor
	const aggregated = new Map<string, Record<string, unknown>>();
	for (const metric of results) {
		const dims = metric.dimensions as Record<string, string>;
		const key = `${dims.userId || 'unknown'}-${dims.vendorId || 'unknown'}`;

		if (!aggregated.has(key)) {
			aggregated.set(key, {
				employeeName: dims.userName || 'Unknown',
				employeeId: dims.userId || 'unknown',
				vendorName: dims.vendorName || 'Unknown',
				vendorId: dims.vendorId || 'unknown',
				totalSales: 0,
				totalRetained: 0,
				shiftsWorked: 0,
				hoursWorked: 0,
				salesPerHour: 0
			});
		}

		const record = aggregated.get(key)!;
		record.totalSales = (record.totalSales as number) + parseFloat(metric.value);
	}

	// Calculate salesPerHour for each record
	for (const record of aggregated.values()) {
		if ((record.hoursWorked as number) > 0) {
			record.salesPerHour = (record.totalSales as number) / (record.hoursWorked as number);
		}
	}

	return { data: Array.from(aggregated.values()) };
}

/**
 * Generate employee performance report with various metrics.
 */
export async function generateEmployeePerformanceReport(params: ReportParams): Promise<{
	data: Record<string, unknown>[];
}> {
	const { dateRange, userId } = params;
	log.debug({ dateRange, userId }, 'Generating employee performance report');

	// Query task completion metrics
	const taskMetrics = await queryMetrics(
		{
			type: 'task_completion_rate',
			dateRange,
			...(userId && { dimensions: { userId } })
		},
		{ groupBy: 'userId', aggregation: 'avg', limit: 100 }
	) as AggregatedMetricResult[];

	// Build report data
	const data: Record<string, unknown>[] = taskMetrics.map(m => ({
		employeeName: m.dimensions.userName || 'Unknown',
		employeeId: m.dimensions.userId || 'unknown',
		totalShifts: 0,
		totalHours: 0,
		totalSales: 0,
		avgSalesPerShift: 0,
		tasksCompleted: m.count,
		onTimeRate: m.value * 100
	}));

	return { data };
}

/**
 * Generate sales trends report over time.
 */
export async function generateSalesTrendsReport(params: ReportParams): Promise<{
	data: Record<string, unknown>[];
}> {
	const { dateRange, userId, vendorId, groupBy = 'day' } = params;
	log.debug({ dateRange, userId, vendorId, groupBy }, 'Generating sales trends report');

	// Determine period type based on groupBy
	const periodType: MetricPeriodType = groupBy === 'month' ? 'monthly' : groupBy === 'week' ? 'weekly' : 'daily';

	// Query sales metrics
	const dimensions: Record<string, string> = {};
	if (userId) dimensions.userId = userId;
	if (vendorId) dimensions.vendorId = vendorId;

	const results = await queryMetrics(
		{
			type: 'vendor_daily_sales',
			dateRange,
			periodType,
			...(Object.keys(dimensions).length > 0 && { dimensions })
		},
		{ limit: 500 }
	) as Metric[];

	// Group by period
	const byPeriod = new Map<string, Record<string, unknown>>();
	for (const metric of results) {
		const periodKey = metric.periodStart.toISOString().split('T')[0];

		if (!byPeriod.has(periodKey)) {
			byPeriod.set(periodKey, {
				period: periodKey,
				totalSales: 0,
				totalRetained: 0,
				vendorCount: 0,
				shiftsCount: 0,
				avgSalesPerShift: 0
			});
		}

		const record = byPeriod.get(periodKey)!;
		record.totalSales = (record.totalSales as number) + parseFloat(metric.value);
		record.vendorCount = (record.vendorCount as number) + 1;
	}

	// Sort by period
	const data = Array.from(byPeriod.values()).sort((a, b) =>
		(a.period as string).localeCompare(b.period as string)
	);

	return { data };
}
