/**
 * @module Services/DataSources/Types
 * @description Type definitions for the data sources framework.
 *
 * This module defines the core interfaces for data sources that feed metrics
 * into the TeamTime platform. Data sources can be scrapers (like LOB scraper),
 * APIs, manual imports, or webhooks.
 *
 * The flow is: fetch raw data -> transform to metrics -> validate -> store
 */

/**
 * Type of data source.
 */
export type DataSourceType = 'scraper' | 'api' | 'manual' | 'webhook';

/**
 * Period type for aggregated metrics.
 */
export type MetricPeriodType = 'daily' | 'weekly' | 'monthly';

/**
 * Status of a sync operation.
 */
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Parameters for fetching data from a source.
 */
export interface FetchParams {
	/** Start of the date range to fetch */
	startDate: Date;

	/** End of the date range to fetch */
	endDate: Date;

	/** Only fetch new data since last sync (if supported by source) */
	incremental?: boolean;
}

/**
 * Raw data retrieved from a data source.
 * This is the unprocessed format before transformation.
 */
export interface RawData {
	/** Name of the source that produced this data */
	source: string;

	/** Timestamp when this data was generated/captured */
	timestamp: Date;

	/** The actual data payload - structure varies by source */
	data: Record<string, unknown>;
}

/**
 * A metric in the standardized format ready for storage.
 * This is the output of the transform step.
 */
export interface TransformedMetric {
	/** Type/category of the metric (e.g., 'vendor_daily_sales', 'task_completion_rate') */
	metricType: string;

	/** Unique key within the metric type (e.g., vendor ID, user ID) */
	metricKey: string;

	/** The numeric value of the metric */
	value: number;

	/** Dimensions for filtering/grouping (e.g., { vendorId: '...', locationId: '...' }) */
	dimensions: Record<string, string>;

	/** Aggregation period granularity */
	periodType: MetricPeriodType;

	/** Start of the measurement period */
	periodStart: Date;

	/** End of the measurement period */
	periodEnd: Date;

	/** Additional metadata about the metric */
	metadata?: Record<string, unknown>;
}

/**
 * Result of validating transformed metrics.
 */
export interface ValidationResult {
	/** Whether all metrics passed validation */
	valid: boolean;

	/** Error messages for invalid metrics */
	errors: string[];

	/** Warning messages (non-fatal issues) */
	warnings: string[];

	/** Count of valid metrics */
	validCount: number;

	/** Count of invalid metrics */
	invalidCount: number;
}

/**
 * Configuration stored in the metricDataSources table.
 */
export interface DataSourceConfig {
	/** Source-specific configuration options */
	[key: string]: unknown;
}

/**
 * Interface that all data sources must implement.
 *
 * Data sources are responsible for:
 * 1. Fetching raw data from their source
 * 2. Transforming raw data into standardized metrics
 * 3. Validating the transformed data
 */
export interface DataSource {
	/** Unique identifier for this data source */
	id: string;

	/** Human-readable name */
	name: string;

	/** Type of data source */
	type: DataSourceType;

	/**
	 * Fetch raw data from the source.
	 *
	 * @param params - Parameters controlling what data to fetch
	 * @returns Array of raw data records
	 */
	fetch(params: FetchParams): Promise<RawData[]>;

	/**
	 * Transform raw data into standardized metrics.
	 *
	 * @param raw - Array of raw data to transform
	 * @returns Array of transformed metrics
	 */
	transform(raw: RawData[]): TransformedMetric[];

	/**
	 * Validate transformed metrics before storage.
	 *
	 * @param data - Array of metrics to validate
	 * @returns Validation result
	 */
	validate(data: TransformedMetric[]): ValidationResult;
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
	/** Whether the sync completed successfully */
	success: boolean;

	/** Name of the data source that was synced */
	sourceName: string;

	/** Number of metrics imported */
	metricsImported: number;

	/** Number of metrics skipped (duplicates, etc.) */
	metricsSkipped: number;

	/** Number of metrics that failed to import */
	metricsErrored: number;

	/** Start of the period that was synced */
	periodStart: Date;

	/** End of the period that was synced */
	periodEnd: Date;

	/** Error message if sync failed */
	error?: string;

	/** Detailed error information */
	errorDetails?: Record<string, unknown>;

	/** When the sync started */
	startedAt: Date;

	/** When the sync completed */
	completedAt: Date;

	/** Duration in milliseconds */
	durationMs: number;
}

/**
 * Status information for a data source.
 */
export interface DataSourceStatus {
	/** Name of the data source */
	name: string;

	/** Type of data source */
	type: DataSourceType;

	/** Whether the source is active */
	isActive: boolean;

	/** Metric types this source provides */
	metricTypes: string[];

	/** When the last sync occurred */
	lastSyncAt?: Date;

	/** Status of the last sync */
	lastSyncStatus?: SyncStatus;

	/** Error from the last sync (if any) */
	lastSyncError?: string;

	/** How often this source syncs (in minutes) */
	syncIntervalMinutes?: number;
}

/**
 * Import history record structure.
 */
export interface ImportHistoryRecord {
	/** Unique identifier */
	id: string;

	/** ID of the data source */
	dataSourceId?: string;

	/** Name of the source */
	sourceName: string;

	/** Type of import (e.g., 'full', 'incremental', 'backfill') */
	importType: string;

	/** Status of the import */
	status: SyncStatus;

	/** Number of metrics imported */
	metricsImported: number;

	/** Number of metrics skipped */
	metricsSkipped: number;

	/** Number of metrics with errors */
	metricsErrored: number;

	/** Start of the imported period */
	periodStart?: Date;

	/** End of the imported period */
	periodEnd?: Date;

	/** Error details if failed */
	errorDetails?: Record<string, unknown>;

	/** When the import started */
	startedAt: Date;

	/** When the import completed */
	completedAt?: Date;
}
