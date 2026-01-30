/**
 * @module Services/MetricCollectors/SalesCollector
 * @description Collects metrics from sales snapshot data.
 *
 * This collector gathers metrics from salesSnapshots:
 * - vendor_daily_sales: Sales per vendor per day
 * - vendor_retained_earnings: Retained earnings per vendor
 * - sales_per_labor_hour: Total sales / total labor hours
 * - vendor_transaction_count: Number of transactions per vendor
 *
 * Sales snapshots contain daily aggregated data from the LOB (Line of Business)
 * software, including per-vendor breakdowns stored in JSONB format.
 */

import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { eq, and, gte, lt, sql, isNotNull } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import type { MetricCollector, DateRange, CollectedMetric } from './types';
import type { VendorSalesData, SalesSnapshot } from '$lib/server/db/schema';

const log = createLogger('services:metric-collectors:sales');

/**
 * Get the start of a day in UTC.
 */
function getStartOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

/**
 * Get the end of a day in UTC.
 */
function getEndOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(23, 59, 59, 999);
	return d;
}

/**
 * Convert a date string (YYYY-MM-DD) to Date objects for day boundaries.
 */
function dateStrToBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
	const dayStart = new Date(dateStr + 'T00:00:00.000Z');
	const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
	return { dayStart, dayEnd };
}

/**
 * Get total labor hours for a specific date.
 */
async function getTotalLaborHours(dayStart: Date, dayEnd: Date): Promise<number> {
	const entries = await db
		.select({
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.where(
			and(
				gte(timeEntries.clockIn, dayStart),
				lt(timeEntries.clockIn, dayEnd),
				isNotNull(timeEntries.clockOut)
			)
		);

	let totalHours = 0;
	for (const entry of entries) {
		if (entry.clockOut) {
			const clockIn = new Date(entry.clockIn);
			const clockOut = new Date(entry.clockOut);
			const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
			if (hours > 0) {
				totalHours += hours;
			}
		}
	}

	return totalHours;
}

/**
 * Collect vendor daily sales metrics.
 * Extracts total sales per vendor per day from snapshots.
 */
async function collectVendorDailySales(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	const startStr = dateRange.start.toISOString().split('T')[0];
	const endStr = dateRange.end.toISOString().split('T')[0];

	// Get all snapshots in the date range
	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startStr),
				lt(salesSnapshots.saleDate, endStr)
			)
		);

	for (const snapshot of snapshots) {
		const dateStr = snapshot.saleDate;
		const { dayStart, dayEnd } = dateStrToBounds(dateStr);
		const vendors = snapshot.vendors as VendorSalesData[];

		for (const vendor of vendors) {
			metrics.push({
				metricType: 'vendor_daily_sales',
				metricKey: `${vendor.vendor_id}:${dateStr}`,
				value: vendor.total_sales,
				dimensions: {
					vendorId: vendor.vendor_id,
					vendorName: vendor.vendor_name,
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'sales_snapshots',
				sourceId: snapshot.id,
				metadata: {
					vendorAmount: vendor.vendor_amount,
					retainedAmount: vendor.retained_amount,
					linkedUserId: vendor.linked_user_id
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected vendor daily sales metrics');
	return metrics;
}

/**
 * Collect vendor retained earnings metrics.
 * Tracks the portion of sales retained by the business per vendor per day.
 */
async function collectVendorRetainedEarnings(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	const startStr = dateRange.start.toISOString().split('T')[0];
	const endStr = dateRange.end.toISOString().split('T')[0];

	const snapshots = await db
		.select()
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startStr),
				lt(salesSnapshots.saleDate, endStr)
			)
		);

	for (const snapshot of snapshots) {
		const dateStr = snapshot.saleDate;
		const { dayStart, dayEnd } = dateStrToBounds(dateStr);
		const vendors = snapshot.vendors as VendorSalesData[];

		for (const vendor of vendors) {
			metrics.push({
				metricType: 'vendor_retained_earnings',
				metricKey: `${vendor.vendor_id}:${dateStr}`,
				value: vendor.retained_amount,
				dimensions: {
					vendorId: vendor.vendor_id,
					vendorName: vendor.vendor_name,
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'sales_snapshots',
				sourceId: snapshot.id,
				metadata: {
					totalSales: vendor.total_sales,
					vendorAmount: vendor.vendor_amount,
					retentionRate: vendor.total_sales > 0
						? (vendor.retained_amount / vendor.total_sales) * 100
						: 0
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected vendor retained earnings metrics');
	return metrics;
}

/**
 * Collect sales per labor hour metrics.
 * Calculates total daily sales divided by total labor hours worked.
 */
async function collectSalesPerLaborHour(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	const startStr = dateRange.start.toISOString().split('T')[0];
	const endStr = dateRange.end.toISOString().split('T')[0];

	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			totalSales: salesSnapshots.totalSales,
			totalRetained: salesSnapshots.totalRetained
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startStr),
				lt(salesSnapshots.saleDate, endStr)
			)
		);

	for (const snapshot of snapshots) {
		const dateStr = snapshot.saleDate;
		const { dayStart, dayEnd } = dateStrToBounds(dateStr);

		// Get total labor hours for this day
		const laborHours = await getTotalLaborHours(dayStart, dayEnd);

		if (laborHours > 0) {
			const totalSales = parseFloat(snapshot.totalSales);
			const salesPerHour = totalSales / laborHours;

			metrics.push({
				metricType: 'sales_per_labor_hour',
				metricKey: dateStr,
				value: Math.round(salesPerHour * 100) / 100,
				dimensions: {
					date: dateStr
				},
				periodType: 'daily',
				periodStart: dayStart,
				periodEnd: dayEnd,
				source: 'sales_snapshots',
				sourceId: snapshot.id,
				metadata: {
					totalSales,
					totalRetained: parseFloat(snapshot.totalRetained),
					laborHours: Math.round(laborHours * 100) / 100,
					unit: 'dollars_per_hour'
				}
			});
		}
	}

	log.debug({ count: metrics.length }, 'Collected sales per labor hour metrics');
	return metrics;
}

/**
 * Collect vendor transaction count metrics.
 * Note: This requires transaction-level data which may not be in snapshots.
 * Currently estimates based on available data or returns vendor count.
 */
async function collectVendorTransactionCount(dateRange: DateRange): Promise<CollectedMetric[]> {
	const metrics: CollectedMetric[] = [];

	const startStr = dateRange.start.toISOString().split('T')[0];
	const endStr = dateRange.end.toISOString().split('T')[0];

	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			vendorCount: salesSnapshots.vendorCount,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(
			and(
				gte(salesSnapshots.saleDate, startStr),
				lt(salesSnapshots.saleDate, endStr)
			)
		);

	for (const snapshot of snapshots) {
		const dateStr = snapshot.saleDate;
		const { dayStart, dayEnd } = dateStrToBounds(dateStr);
		const vendors = snapshot.vendors as VendorSalesData[];

		// If vendors have transaction data, use it; otherwise count vendors with sales
		for (const vendor of vendors) {
			// Estimate transactions: vendors with sales had at least 1 transaction
			// In a real implementation, this would come from the LOB data
			const transactionCount = vendor.total_sales > 0 ? 1 : 0;

			if (transactionCount > 0) {
				metrics.push({
					metricType: 'vendor_transaction_count',
					metricKey: `${vendor.vendor_id}:${dateStr}`,
					value: transactionCount,
					dimensions: {
						vendorId: vendor.vendor_id,
						vendorName: vendor.vendor_name,
						date: dateStr
					},
					periodType: 'daily',
					periodStart: dayStart,
					periodEnd: dayEnd,
					source: 'sales_snapshots',
					sourceId: snapshot.id,
					metadata: {
						note: 'Estimated from daily snapshot - actual transaction count requires LOB integration',
						totalSales: vendor.total_sales
					}
				});
			}
		}
	}

	log.debug({ count: metrics.length }, 'Collected vendor transaction count metrics');
	return metrics;
}

/**
 * Sales metric collector.
 * Collects sales-related metrics from salesSnapshots data.
 */
export const salesCollector: MetricCollector = {
	name: 'sales',
	description: 'Collects sales metrics from daily snapshots including vendor performance and labor efficiency',
	metricTypes: [
		'vendor_daily_sales',
		'vendor_retained_earnings',
		'sales_per_labor_hour',
		'vendor_transaction_count'
	],

	async collect(dateRange: DateRange): Promise<CollectedMetric[]> {
		log.info({
			startDate: dateRange.start.toISOString(),
			endDate: dateRange.end.toISOString()
		}, 'Collecting sales metrics');

		const allMetrics: CollectedMetric[] = [];

		// Collect all metric types
		const [
			dailySalesMetrics,
			retainedEarningsMetrics,
			salesPerHourMetrics,
			transactionCountMetrics
		] = await Promise.all([
			collectVendorDailySales(dateRange),
			collectVendorRetainedEarnings(dateRange),
			collectSalesPerLaborHour(dateRange),
			collectVendorTransactionCount(dateRange)
		]);

		allMetrics.push(
			...dailySalesMetrics,
			...retainedEarningsMetrics,
			...salesPerHourMetrics,
			...transactionCountMetrics
		);

		log.info({
			totalMetrics: allMetrics.length,
			byType: {
				vendor_daily_sales: dailySalesMetrics.length,
				vendor_retained_earnings: retainedEarningsMetrics.length,
				sales_per_labor_hour: salesPerHourMetrics.length,
				vendor_transaction_count: transactionCountMetrics.length
			}
		}, 'Sales metrics collection completed');

		return allMetrics;
	}
};

export default salesCollector;
