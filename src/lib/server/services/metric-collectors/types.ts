/**
 * @module Services/MetricCollectors/Types
 * @description Type definitions for the metric collection framework.
 *
 * This module defines the core interfaces used by all metric collectors
 * in the TeamTime platform. Collectors gather data from various sources
 * (tasks, time entries, sales snapshots) and produce standardized metrics.
 */

/**
 * Period type for metric aggregation.
 * Determines the granularity of the collected metric.
 */
export type MetricPeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Date range for collecting metrics.
 * Collectors use this to query data within a specific time window.
 */
export interface DateRange {
	start: Date;
	end: Date;
}

/**
 * A collected metric ready for storage or analysis.
 *
 * Each metric has a type (what is being measured), a key (unique identifier
 * within that type), and dimensions that allow for filtering and grouping.
 */
export interface CollectedMetric {
	/** The type/category of metric (e.g., 'task_completion_rate', 'vendor_daily_sales') */
	metricType: string;

	/** Unique key within the metric type (e.g., user ID, vendor ID) */
	metricKey: string;

	/** The numeric value of the metric */
	value: number;

	/** Dimensions for filtering/grouping (e.g., { userId: '...', locationId: '...' }) */
	dimensions: Record<string, string>;

	/** Aggregation period granularity */
	periodType: MetricPeriodType;

	/** Start of the measurement period */
	periodStart: Date;

	/** End of the measurement period */
	periodEnd: Date;

	/** Source system/table that produced this metric */
	source: string;

	/** Optional ID linking back to the source record */
	sourceId?: string;

	/** Additional metadata about the metric */
	metadata?: Record<string, unknown>;
}

/**
 * Interface that all metric collectors must implement.
 *
 * Collectors are responsible for:
 * 1. Defining what metrics they provide
 * 2. Querying the relevant data sources
 * 3. Calculating and returning standardized metrics
 */
export interface MetricCollector {
	/** Unique name identifying this collector */
	name: string;

	/** Human-readable description of what this collector measures */
	description: string;

	/** List of metric types this collector provides */
	metricTypes: string[];

	/**
	 * Collect metrics for the specified date range.
	 *
	 * @param dateRange - The time window to collect metrics for
	 * @returns Array of collected metrics
	 */
	collect(dateRange: DateRange): Promise<CollectedMetric[]>;
}

/**
 * Result from running all collectors.
 */
export interface CollectionResult {
	/** Total number of metrics collected */
	totalMetrics: number;

	/** Breakdown by collector */
	byCollector: Record<string, {
		metricsCount: number;
		duration: number;
		errors: string[];
	}>;

	/** All collected metrics */
	metrics: CollectedMetric[];

	/** Overall collection duration in milliseconds */
	durationMs: number;
}

/**
 * Options for running collectors.
 */
export interface CollectionOptions {
	/** Only run specific collectors by name */
	collectors?: string[];

	/** Only collect specific metric types */
	metricTypes?: string[];

	/** Continue collecting even if a collector fails */
	continueOnError?: boolean;
}
