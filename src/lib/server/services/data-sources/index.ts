/**
 * @module Services/DataSources
 * @description Registry and orchestration for external data sources.
 *
 * This module provides a centralized registry for data sources that feed metrics
 * into TeamTime. Data sources can be registered, queried, synced, and their
 * import history tracked.
 *
 * Unlike metric collectors (which gather internal TeamTime data), data sources
 * are for external data that needs to be fetched, transformed, and validated.
 *
 * Usage:
 * ```typescript
 * import { registerDataSource, syncDataSource } from '$lib/server/services/data-sources';
 * import { lobScraperSource } from './lob-scraper-source';
 *
 * // Register the data source
 * registerDataSource(lobScraperSource);
 *
 * // Sync data for a date range
 * const result = await syncDataSource('lob-scraper', {
 *   startDate: new Date('2025-01-01'),
 *   endDate: new Date('2025-01-31')
 * });
 * ```
 */

import { createLogger } from '$lib/server/logger';
import { db } from '$lib/server/db';
import { sql, desc, eq } from 'drizzle-orm';
import type {
	DataSource,
	DataSourceStatus,
	SyncResult,
	FetchParams,
	ImportHistoryRecord,
	TransformedMetric
} from './types';

const log = createLogger('services:data-sources');

// Registry of all data sources
const dataSources: Map<string, DataSource> = new Map();

/**
 * Register a data source with the registry.
 *
 * @param source - The data source to register
 * @throws Error if a source with the same name already exists
 */
export function registerDataSource(source: DataSource): void {
	if (dataSources.has(source.name)) {
		throw new Error(`Data source '${source.name}' is already registered`);
	}

	log.info(
		{ sourceName: source.name, sourceType: source.type, sourceId: source.id },
		'Registering data source'
	);
	dataSources.set(source.name, source);
}

/**
 * Unregister a data source from the registry.
 *
 * @param name - The name of the source to unregister
 * @returns True if the source was found and removed, false otherwise
 */
export function unregisterDataSource(name: string): boolean {
	const removed = dataSources.delete(name);
	if (removed) {
		log.info({ sourceName: name }, 'Unregistered data source');
	}
	return removed;
}

/**
 * Get a data source by name.
 *
 * @param name - The name of the source to retrieve
 * @returns The data source if found, undefined otherwise
 */
export function getDataSource(name: string): DataSource | undefined {
	return dataSources.get(name);
}

/**
 * Get all registered data sources.
 *
 * @returns Array of all registered data sources
 */
export function getAllDataSources(): DataSource[] {
	return Array.from(dataSources.values());
}

/**
 * Get all data source names.
 *
 * @returns Array of all registered source names
 */
export function getDataSourceNames(): string[] {
	return Array.from(dataSources.keys());
}

/**
 * Sync a data source - fetch, transform, validate, and store metrics.
 *
 * @param name - Name of the data source to sync
 * @param dateRange - Optional date range to sync (defaults to last 24 hours)
 * @returns Sync result with import statistics
 */
export async function syncDataSource(
	name: string,
	dateRange?: { startDate: Date; endDate: Date }
): Promise<SyncResult> {
	const source = dataSources.get(name);
	if (!source) {
		throw new Error(`Data source '${name}' not found`);
	}

	const startedAt = new Date();
	const startTime = performance.now();

	// Default to last 24 hours if no date range specified
	const params: FetchParams = dateRange ?? {
		startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
		endDate: new Date()
	};

	log.info(
		{
			sourceName: name,
			startDate: params.startDate.toISOString(),
			endDate: params.endDate.toISOString()
		},
		'Starting data source sync'
	);

	try {
		// Step 1: Fetch raw data
		log.debug({ sourceName: name }, 'Fetching raw data');
		const rawData = await source.fetch(params);
		log.debug({ sourceName: name, recordCount: rawData.length }, 'Fetched raw data');

		// Step 2: Transform to metrics
		log.debug({ sourceName: name }, 'Transforming data to metrics');
		const metrics = source.transform(rawData);
		log.debug({ sourceName: name, metricCount: metrics.length }, 'Transformed data');

		// Step 3: Validate metrics
		log.debug({ sourceName: name }, 'Validating metrics');
		const validation = source.validate(metrics);

		if (!validation.valid && validation.errors.length > 0) {
			log.warn(
				{
					sourceName: name,
					errors: validation.errors.slice(0, 5),
					totalErrors: validation.errors.length
				},
				'Validation errors detected'
			);
		}

		if (validation.warnings.length > 0) {
			log.warn(
				{
					sourceName: name,
					warnings: validation.warnings.slice(0, 5),
					totalWarnings: validation.warnings.length
				},
				'Validation warnings'
			);
		}

		// Step 4: Store valid metrics
		const validMetrics = metrics.slice(0, validation.validCount);
		const stored = await storeMetrics(validMetrics, source.name);

		const completedAt = new Date();
		const durationMs = Math.round(performance.now() - startTime);

		const result: SyncResult = {
			success: true,
			sourceName: name,
			metricsImported: stored.imported,
			metricsSkipped: stored.skipped,
			metricsErrored: validation.invalidCount,
			periodStart: params.startDate,
			periodEnd: params.endDate,
			startedAt,
			completedAt,
			durationMs
		};

		// Record import history
		await recordImportHistory({
			sourceName: name,
			importType: params.incremental ? 'incremental' : 'full',
			status: 'completed',
			metricsImported: result.metricsImported,
			metricsSkipped: result.metricsSkipped,
			metricsErrored: result.metricsErrored,
			periodStart: params.startDate,
			periodEnd: params.endDate,
			startedAt,
			completedAt
		});

		log.info(
			{
				sourceName: name,
				metricsImported: result.metricsImported,
				metricsSkipped: result.metricsSkipped,
				metricsErrored: result.metricsErrored,
				durationMs
			},
			'Data source sync completed'
		);

		return result;
	} catch (error) {
		const completedAt = new Date();
		const durationMs = Math.round(performance.now() - startTime);
		const errorMessage = error instanceof Error ? error.message : String(error);

		const result: SyncResult = {
			success: false,
			sourceName: name,
			metricsImported: 0,
			metricsSkipped: 0,
			metricsErrored: 0,
			periodStart: params.startDate,
			periodEnd: params.endDate,
			error: errorMessage,
			errorDetails: error instanceof Error ? { stack: error.stack } : undefined,
			startedAt,
			completedAt,
			durationMs
		};

		// Record failed import
		await recordImportHistory({
			sourceName: name,
			importType: params.incremental ? 'incremental' : 'full',
			status: 'failed',
			metricsImported: 0,
			metricsSkipped: 0,
			metricsErrored: 0,
			periodStart: params.startDate,
			periodEnd: params.endDate,
			errorDetails: { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
			startedAt,
			completedAt
		});

		log.error(
			{
				sourceName: name,
				error: errorMessage,
				durationMs
			},
			'Data source sync failed'
		);

		return result;
	}
}

/**
 * Get the status of a data source.
 *
 * @param name - Name of the data source
 * @returns Status information or undefined if not found
 */
export async function getDataSourceStatus(name: string): Promise<DataSourceStatus | undefined> {
	const source = dataSources.get(name);
	if (!source) {
		return undefined;
	}

	// Try to get last sync info from database
	try {
		// Query the metricDataSources table if it exists
		const result = await db.execute(sql`
			SELECT
				last_sync_at,
				last_sync_status,
				last_sync_error,
				sync_interval_minutes,
				is_active,
				metric_types
			FROM metric_data_sources
			WHERE name = ${name}
			LIMIT 1
		`);

		if (result.rows && result.rows.length > 0) {
			const row = result.rows[0] as {
				last_sync_at?: string;
				last_sync_status?: string;
				last_sync_error?: string;
				sync_interval_minutes?: number;
				is_active?: boolean;
				metric_types?: string[];
			};

			return {
				name: source.name,
				type: source.type,
				isActive: row.is_active ?? true,
				metricTypes: row.metric_types ?? [],
				lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : undefined,
				lastSyncStatus: row.last_sync_status as DataSourceStatus['lastSyncStatus'],
				lastSyncError: row.last_sync_error ?? undefined,
				syncIntervalMinutes: row.sync_interval_minutes
			};
		}
	} catch (error) {
		// Table might not exist yet, fall back to in-memory info
		log.debug({ sourceName: name, error }, 'Could not query metric_data_sources table');
	}

	// Fall back to basic info from registry
	return {
		name: source.name,
		type: source.type,
		isActive: true,
		metricTypes: []
	};
}

/**
 * Record an import in the history table.
 *
 * @param record - Import history record to save
 */
export async function recordImportHistory(
	record: Omit<ImportHistoryRecord, 'id'>
): Promise<void> {
	try {
		await db.execute(sql`
			INSERT INTO metric_import_history (
				source_name,
				import_type,
				status,
				metrics_imported,
				metrics_skipped,
				metrics_errored,
				period_start,
				period_end,
				error_details,
				started_at,
				completed_at
			) VALUES (
				${record.sourceName},
				${record.importType},
				${record.status},
				${record.metricsImported},
				${record.metricsSkipped},
				${record.metricsErrored},
				${record.periodStart?.toISOString() ?? null},
				${record.periodEnd?.toISOString() ?? null},
				${record.errorDetails ? JSON.stringify(record.errorDetails) : null},
				${record.startedAt.toISOString()},
				${record.completedAt?.toISOString() ?? null}
			)
		`);

		log.debug({ sourceName: record.sourceName, status: record.status }, 'Recorded import history');
	} catch (error) {
		// Log but don't fail - history is informational
		log.warn(
			{
				sourceName: record.sourceName,
				error: error instanceof Error ? error.message : String(error)
			},
			'Failed to record import history (table may not exist)'
		);
	}
}

/**
 * Get import history for a data source.
 *
 * @param sourceName - Optional source name to filter by
 * @param limit - Maximum number of records to return (default 50)
 * @returns Array of import history records
 */
export async function getImportHistory(
	sourceName?: string,
	limit: number = 50
): Promise<ImportHistoryRecord[]> {
	try {
		let query: string;
		let params: unknown[];

		if (sourceName) {
			query = `
				SELECT
					id,
					data_source_id,
					source_name,
					import_type,
					status,
					metrics_imported,
					metrics_skipped,
					metrics_errored,
					period_start,
					period_end,
					error_details,
					started_at,
					completed_at
				FROM metric_import_history
				WHERE source_name = $1
				ORDER BY started_at DESC
				LIMIT $2
			`;
			params = [sourceName, limit];
		} else {
			query = `
				SELECT
					id,
					data_source_id,
					source_name,
					import_type,
					status,
					metrics_imported,
					metrics_skipped,
					metrics_errored,
					period_start,
					period_end,
					error_details,
					started_at,
					completed_at
				FROM metric_import_history
				ORDER BY started_at DESC
				LIMIT $1
			`;
			params = [limit];
		}

		const result = await db.execute(sql.raw(query));

		if (!result.rows) {
			return [];
		}

		return result.rows.map((row: Record<string, unknown>) => ({
			id: row.id as string,
			dataSourceId: row.data_source_id as string | undefined,
			sourceName: row.source_name as string,
			importType: row.import_type as string,
			status: row.status as ImportHistoryRecord['status'],
			metricsImported: row.metrics_imported as number,
			metricsSkipped: row.metrics_skipped as number,
			metricsErrored: row.metrics_errored as number,
			periodStart: row.period_start ? new Date(row.period_start as string) : undefined,
			periodEnd: row.period_end ? new Date(row.period_end as string) : undefined,
			errorDetails: row.error_details as Record<string, unknown> | undefined,
			startedAt: new Date(row.started_at as string),
			completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined
		}));
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			'Failed to get import history (table may not exist)'
		);
		return [];
	}
}

/**
 * Store transformed metrics in the database.
 * This is an internal helper that inserts metrics into the metrics table.
 *
 * @param metrics - Array of metrics to store
 * @param sourceName - Name of the source these metrics came from
 * @returns Count of imported and skipped metrics
 */
async function storeMetrics(
	metrics: TransformedMetric[],
	sourceName: string
): Promise<{ imported: number; skipped: number }> {
	if (metrics.length === 0) {
		return { imported: 0, skipped: 0 };
	}

	let imported = 0;
	let skipped = 0;

	// Insert metrics in batches
	const batchSize = 100;
	for (let i = 0; i < metrics.length; i += batchSize) {
		const batch = metrics.slice(i, i + batchSize);

		try {
			for (const metric of batch) {
				try {
					await db.execute(sql`
						INSERT INTO metrics (
							metric_type,
							metric_key,
							value,
							dimensions,
							period_type,
							period_start,
							period_end,
							source,
							metadata
						) VALUES (
							${metric.metricType},
							${metric.metricKey},
							${metric.value},
							${JSON.stringify(metric.dimensions)},
							${metric.periodType},
							${metric.periodStart.toISOString()},
							${metric.periodEnd.toISOString()},
							${sourceName},
							${metric.metadata ? JSON.stringify(metric.metadata) : null}
						)
						ON CONFLICT DO NOTHING
					`);
					imported++;
				} catch (error) {
					// Individual metric insert failed (likely duplicate)
					skipped++;
					log.debug(
						{
							metricType: metric.metricType,
							metricKey: metric.metricKey,
							error: error instanceof Error ? error.message : String(error)
						},
						'Skipped metric'
					);
				}
			}
		} catch (error) {
			log.error(
				{
					batchStart: i,
					batchSize: batch.length,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to insert metric batch'
			);
			skipped += batch.length;
		}
	}

	return { imported, skipped };
}

/**
 * Clear all registered data sources.
 * Mainly useful for testing.
 */
export function clearDataSources(): void {
	dataSources.clear();
	log.debug('Cleared all data sources');
}

// Re-export types
export * from './types';
