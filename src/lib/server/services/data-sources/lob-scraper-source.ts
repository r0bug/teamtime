/**
 * @module Services/DataSources/LobScraperSource
 * @description Data source adapter for the LOB scraper.
 *
 * This data source reads from the existing salesSnapshots table (populated by
 * the LOB scraper) and transforms the data into standardized metrics format.
 * It's useful for:
 * - Backfilling historical data into the metrics system
 * - Providing a consistent interface for sales data
 *
 * Note: This source does NOT fetch new data from the LOB system - it reads
 * data that was already scraped and stored in salesSnapshots.
 *
 * Metrics produced:
 * - vendor_daily_sales: Total sales per vendor per day
 * - vendor_retained_earnings: Retained earnings per vendor per day
 * - total_daily_sales: Total sales across all vendors per day
 * - total_retained_earnings: Total retained earnings per day
 */

import { createLogger } from '$lib/server/logger';
import { db, salesSnapshots } from '$lib/server/db';
import { and, gte, lte, sql } from 'drizzle-orm';
import type {
	DataSource,
	FetchParams,
	RawData,
	TransformedMetric,
	ValidationResult
} from './types';
import type { VendorSalesData } from '$lib/server/db/schema';

const log = createLogger('data-sources:lob-scraper');

/**
 * Metric types produced by this source.
 */
export const LOB_METRIC_TYPES = {
	VENDOR_DAILY_SALES: 'vendor_daily_sales',
	VENDOR_RETAINED_EARNINGS: 'vendor_retained_earnings',
	TOTAL_DAILY_SALES: 'total_daily_sales',
	TOTAL_RETAINED_EARNINGS: 'total_retained_earnings',
	VENDOR_COUNT: 'vendor_count'
} as const;

/**
 * LOB Scraper data source.
 *
 * Reads from the salesSnapshots table and transforms vendor sales data
 * into standardized metrics.
 */
export const lobScraperSource: DataSource = {
	id: 'lob-scraper-source',
	name: 'lob-scraper',
	type: 'scraper',

	/**
	 * Fetch sales snapshot data from the database.
	 *
	 * This reads existing salesSnapshots records for the given date range.
	 * It does NOT make external requests - the scraper job populates this table.
	 */
	async fetch(params: FetchParams): Promise<RawData[]> {
		const { startDate, endDate } = params;

		log.debug(
			{
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString()
			},
			'Fetching sales snapshots'
		);

		// Convert dates to date strings (YYYY-MM-DD) for the saleDate column
		const startDateStr = startDate.toISOString().split('T')[0];
		const endDateStr = endDate.toISOString().split('T')[0];

		try {
			const snapshots = await db
				.select()
				.from(salesSnapshots)
				.where(
					and(
						gte(salesSnapshots.saleDate, startDateStr),
						lte(salesSnapshots.saleDate, endDateStr)
					)
				)
				.orderBy(salesSnapshots.saleDate);

			log.info(
				{
					snapshotCount: snapshots.length,
					startDate: startDateStr,
					endDate: endDateStr
				},
				'Fetched sales snapshots'
			);

			// Convert to RawData format
			return snapshots.map((snapshot) => ({
				source: 'salesSnapshots',
				timestamp: snapshot.capturedAt,
				data: {
					id: snapshot.id,
					saleDate: snapshot.saleDate,
					totalSales: snapshot.totalSales,
					totalVendorAmount: snapshot.totalVendorAmount,
					totalRetained: snapshot.totalRetained,
					vendorCount: snapshot.vendorCount,
					vendors: snapshot.vendors,
					source: snapshot.source,
					aiRunId: snapshot.aiRunId
				}
			}));
		} catch (error) {
			log.error(
				{
					error: error instanceof Error ? error.message : String(error),
					startDate: startDateStr,
					endDate: endDateStr
				},
				'Failed to fetch sales snapshots'
			);
			throw error;
		}
	},

	/**
	 * Transform sales snapshots into standardized metrics.
	 *
	 * Each snapshot produces:
	 * - One metric per vendor for daily sales
	 * - One metric per vendor for retained earnings
	 * - One metric for total daily sales
	 * - One metric for total retained earnings
	 */
	transform(raw: RawData[]): TransformedMetric[] {
		const metrics: TransformedMetric[] = [];

		for (const record of raw) {
			const data = record.data as {
				id: string;
				saleDate: string;
				totalSales: string;
				totalVendorAmount: string;
				totalRetained: string;
				vendorCount: number;
				vendors: VendorSalesData[];
				source: string | null;
			};

			// Parse the sale date
			const saleDate = new Date(data.saleDate);
			const periodStart = new Date(saleDate);
			periodStart.setHours(0, 0, 0, 0);

			const periodEnd = new Date(saleDate);
			periodEnd.setHours(23, 59, 59, 999);

			// Total daily sales metric
			metrics.push({
				metricType: LOB_METRIC_TYPES.TOTAL_DAILY_SALES,
				metricKey: data.saleDate,
				value: parseFloat(data.totalSales) || 0,
				dimensions: {
					source: data.source || 'scraper'
				},
				periodType: 'daily',
				periodStart,
				periodEnd,
				metadata: {
					snapshotId: data.id,
					vendorCount: data.vendorCount
				}
			});

			// Total retained earnings metric
			metrics.push({
				metricType: LOB_METRIC_TYPES.TOTAL_RETAINED_EARNINGS,
				metricKey: data.saleDate,
				value: parseFloat(data.totalRetained) || 0,
				dimensions: {
					source: data.source || 'scraper'
				},
				periodType: 'daily',
				periodStart,
				periodEnd,
				metadata: {
					snapshotId: data.id,
					vendorCount: data.vendorCount
				}
			});

			// Vendor count metric
			metrics.push({
				metricType: LOB_METRIC_TYPES.VENDOR_COUNT,
				metricKey: data.saleDate,
				value: data.vendorCount,
				dimensions: {
					source: data.source || 'scraper'
				},
				periodType: 'daily',
				periodStart,
				periodEnd,
				metadata: {
					snapshotId: data.id
				}
			});

			// Per-vendor metrics
			if (data.vendors && Array.isArray(data.vendors)) {
				for (const vendor of data.vendors) {
					// Vendor daily sales
					metrics.push({
						metricType: LOB_METRIC_TYPES.VENDOR_DAILY_SALES,
						metricKey: `${vendor.vendor_id}-${data.saleDate}`,
						value: vendor.total_sales || 0,
						dimensions: {
							vendorId: vendor.vendor_id,
							vendorName: vendor.vendor_name,
							source: data.source || 'scraper'
						},
						periodType: 'daily',
						periodStart,
						periodEnd,
						metadata: {
							snapshotId: data.id,
							vendorAmount: vendor.vendor_amount
						}
					});

					// Vendor retained earnings
					metrics.push({
						metricType: LOB_METRIC_TYPES.VENDOR_RETAINED_EARNINGS,
						metricKey: `${vendor.vendor_id}-${data.saleDate}`,
						value: vendor.retained_amount || 0,
						dimensions: {
							vendorId: vendor.vendor_id,
							vendorName: vendor.vendor_name,
							source: data.source || 'scraper'
						},
						periodType: 'daily',
						periodStart,
						periodEnd,
						metadata: {
							snapshotId: data.id,
							totalSales: vendor.total_sales,
							vendorAmount: vendor.vendor_amount
						}
					});
				}
			}
		}

		log.debug(
			{
				inputRecords: raw.length,
				outputMetrics: metrics.length
			},
			'Transformed sales snapshots to metrics'
		);

		return metrics;
	},

	/**
	 * Validate transformed metrics.
	 *
	 * Checks for:
	 * - Required fields are present
	 * - Values are valid numbers
	 * - Dates are valid
	 */
	validate(data: TransformedMetric[]): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		let validCount = 0;
		let invalidCount = 0;

		for (let i = 0; i < data.length; i++) {
			const metric = data[i];
			const issues: string[] = [];

			// Check required fields
			if (!metric.metricType) {
				issues.push('Missing metricType');
			}
			if (!metric.metricKey) {
				issues.push('Missing metricKey');
			}
			if (typeof metric.value !== 'number' || isNaN(metric.value)) {
				issues.push(`Invalid value: ${metric.value}`);
			}
			if (!metric.periodStart || !(metric.periodStart instanceof Date)) {
				issues.push('Invalid periodStart');
			}
			if (!metric.periodEnd || !(metric.periodEnd instanceof Date)) {
				issues.push('Invalid periodEnd');
			}

			// Check for negative values (warning only)
			if (metric.value < 0) {
				warnings.push(
					`Metric ${i} (${metric.metricType}/${metric.metricKey}) has negative value: ${metric.value}`
				);
			}

			if (issues.length > 0) {
				errors.push(`Metric ${i} (${metric.metricType}/${metric.metricKey}): ${issues.join(', ')}`);
				invalidCount++;
			} else {
				validCount++;
			}
		}

		return {
			valid: invalidCount === 0,
			errors,
			warnings,
			validCount,
			invalidCount
		};
	}
};

/**
 * Create a backfill function for historical data.
 *
 * This fetches all sales snapshots within a date range and transforms them
 * into metrics format. Useful for populating the metrics table with
 * historical data.
 *
 * @param startDate - Start of the backfill period
 * @param endDate - End of the backfill period
 * @returns Array of transformed metrics
 */
export async function backfillSalesMetrics(
	startDate: Date,
	endDate: Date
): Promise<TransformedMetric[]> {
	log.info(
		{
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString()
		},
		'Starting sales metrics backfill'
	);

	const rawData = await lobScraperSource.fetch({ startDate, endDate });
	const metrics = lobScraperSource.transform(rawData);
	const validation = lobScraperSource.validate(metrics);

	if (!validation.valid) {
		log.warn(
			{
				errors: validation.errors.slice(0, 10),
				totalErrors: validation.errors.length
			},
			'Backfill validation errors'
		);
	}

	log.info(
		{
			totalSnapshots: rawData.length,
			totalMetrics: metrics.length,
			validMetrics: validation.validCount,
			invalidMetrics: validation.invalidCount
		},
		'Completed sales metrics backfill'
	);

	return metrics;
}

export default lobScraperSource;
