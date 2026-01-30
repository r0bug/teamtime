/**
 * @module Services/DataSources/ManualSource
 * @description Data source for manual data entry and import.
 *
 * This data source handles manual data imports via CSV or JSON format.
 * It's designed for:
 * - One-time data imports
 * - Corrections to existing data
 * - Data that doesn't have an automated source
 *
 * Supported formats:
 * - CSV: Comma-separated values with header row
 * - JSON: Array of metric objects or nested structure
 *
 * Usage:
 * ```typescript
 * import { manualSource, parseCSV, parseJSON } from './manual-source';
 *
 * // Import from CSV
 * const csvData = `metricType,metricKey,value,periodStart,periodEnd
 * vendor_daily_sales,vendor-1-2025-01-15,1500.00,2025-01-15,2025-01-15`;
 *
 * const rawData = parseCSV(csvData);
 * const metrics = manualSource.transform(rawData);
 * ```
 */

import { createLogger } from '$lib/server/logger';
import type {
	DataSource,
	FetchParams,
	RawData,
	TransformedMetric,
	ValidationResult,
	MetricPeriodType
} from './types';

const log = createLogger('data-sources:manual');

/**
 * Expected CSV columns for metric import.
 */
export const REQUIRED_CSV_COLUMNS = [
	'metricType',
	'metricKey',
	'value',
	'periodStart',
	'periodEnd'
] as const;

/**
 * Optional CSV columns.
 */
export const OPTIONAL_CSV_COLUMNS = ['periodType', 'dimensions', 'metadata'] as const;

/**
 * Valid period types.
 */
const VALID_PERIOD_TYPES: MetricPeriodType[] = ['daily', 'weekly', 'monthly'];

/**
 * In-memory buffer for manual data.
 * Data is staged here before being processed.
 */
let manualDataBuffer: RawData[] = [];

/**
 * Add data to the manual import buffer.
 *
 * @param data - Array of raw data to add
 */
export function stageManualData(data: RawData[]): void {
	manualDataBuffer.push(...data);
	log.debug({ recordCount: data.length, totalBuffered: manualDataBuffer.length }, 'Staged manual data');
}

/**
 * Clear the manual import buffer.
 */
export function clearManualBuffer(): void {
	const count = manualDataBuffer.length;
	manualDataBuffer = [];
	log.debug({ clearedCount: count }, 'Cleared manual data buffer');
}

/**
 * Get the current buffer contents (for inspection).
 */
export function getManualBuffer(): RawData[] {
	return [...manualDataBuffer];
}

/**
 * Parse CSV data into RawData format.
 *
 * @param csvContent - CSV string content with header row
 * @param sourceName - Optional source name for tracking (default: 'csv-import')
 * @returns Array of raw data records
 * @throws Error if CSV is invalid or missing required columns
 */
export function parseCSV(csvContent: string, sourceName: string = 'csv-import'): RawData[] {
	const lines = csvContent.trim().split('\n');

	if (lines.length < 2) {
		throw new Error('CSV must have at least a header row and one data row');
	}

	// Parse header
	const headers = parseCSVLine(lines[0]);

	// Validate required columns
	const missingColumns = REQUIRED_CSV_COLUMNS.filter((col) => !headers.includes(col));
	if (missingColumns.length > 0) {
		throw new Error(`CSV is missing required columns: ${missingColumns.join(', ')}`);
	}

	// Parse data rows
	const rawData: RawData[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue; // Skip empty lines

		const values = parseCSVLine(line);

		if (values.length !== headers.length) {
			log.warn(
				{ lineNumber: i + 1, expected: headers.length, got: values.length },
				'CSV line has wrong number of columns, skipping'
			);
			continue;
		}

		// Build data object from columns
		const data: Record<string, unknown> = {};
		for (let j = 0; j < headers.length; j++) {
			const header = headers[j];
			let value: unknown = values[j];

			// Parse special columns
			if (header === 'dimensions' || header === 'metadata') {
				try {
					value = value ? JSON.parse(value as string) : {};
				} catch {
					value = {};
				}
			} else if (header === 'value') {
				value = parseFloat(value as string);
			}

			data[header] = value;
		}

		rawData.push({
			source: sourceName,
			timestamp: new Date(),
			data
		});
	}

	log.info({ rowsParsed: rawData.length, totalLines: lines.length }, 'Parsed CSV data');

	return rawData;
}

/**
 * Parse a single CSV line, handling quoted values.
 */
function parseCSVLine(line: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// Escaped quote
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			values.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	// Don't forget the last value
	values.push(current.trim());

	return values;
}

/**
 * Parse JSON data into RawData format.
 *
 * Supports two formats:
 * 1. Array of metric objects: [{ metricType, metricKey, value, ... }, ...]
 * 2. Wrapped format: { metrics: [...], source: '...', timestamp: '...' }
 *
 * @param jsonContent - JSON string or parsed object
 * @param sourceName - Optional source name for tracking (default: 'json-import')
 * @returns Array of raw data records
 */
export function parseJSON(
	jsonContent: string | unknown,
	sourceName: string = 'json-import'
): RawData[] {
	let parsed: unknown;

	if (typeof jsonContent === 'string') {
		try {
			parsed = JSON.parse(jsonContent);
		} catch (error) {
			throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
	} else {
		parsed = jsonContent;
	}

	const rawData: RawData[] = [];
	const timestamp = new Date();

	// Handle wrapped format
	if (parsed && typeof parsed === 'object' && 'metrics' in parsed) {
		const wrapped = parsed as { metrics: unknown[]; source?: string; timestamp?: string };
		const source = wrapped.source || sourceName;
		const ts = wrapped.timestamp ? new Date(wrapped.timestamp) : timestamp;

		if (!Array.isArray(wrapped.metrics)) {
			throw new Error('Wrapped format must have "metrics" as an array');
		}

		for (const metric of wrapped.metrics) {
			if (metric && typeof metric === 'object') {
				rawData.push({
					source,
					timestamp: ts,
					data: metric as Record<string, unknown>
				});
			}
		}
	}
	// Handle array format
	else if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (item && typeof item === 'object') {
				rawData.push({
					source: sourceName,
					timestamp,
					data: item as Record<string, unknown>
				});
			}
		}
	}
	// Handle single object
	else if (parsed && typeof parsed === 'object') {
		rawData.push({
			source: sourceName,
			timestamp,
			data: parsed as Record<string, unknown>
		});
	} else {
		throw new Error('JSON must be an object, array, or wrapped format { metrics: [...] }');
	}

	log.info({ recordsParsed: rawData.length }, 'Parsed JSON data');

	return rawData;
}

/**
 * Manual data source.
 *
 * Processes manually staged data (from CSV or JSON imports) into metrics.
 */
export const manualSource: DataSource = {
	id: 'manual-source',
	name: 'manual',
	type: 'manual',

	/**
	 * Fetch data from the manual buffer.
	 *
	 * Unlike other sources, this reads from the in-memory buffer that was
	 * populated via stageManualData(), parseCSV(), or parseJSON().
	 *
	 * The date range is used to filter the staged data by period dates.
	 */
	async fetch(params: FetchParams): Promise<RawData[]> {
		const { startDate, endDate } = params;

		log.debug(
			{
				bufferSize: manualDataBuffer.length,
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString()
			},
			'Fetching from manual buffer'
		);

		// Filter by date range if the data has period dates
		const filtered = manualDataBuffer.filter((record) => {
			const data = record.data as { periodStart?: string; periodEnd?: string };

			// If no period dates, include the record
			if (!data.periodStart && !data.periodEnd) {
				return true;
			}

			// Check if record's period overlaps with the requested range
			const recordStart = data.periodStart ? new Date(data.periodStart) : null;
			const recordEnd = data.periodEnd ? new Date(data.periodEnd) : null;

			if (recordStart && recordStart > endDate) return false;
			if (recordEnd && recordEnd < startDate) return false;

			return true;
		});

		log.info(
			{
				totalBuffered: manualDataBuffer.length,
				filtered: filtered.length
			},
			'Fetched from manual buffer'
		);

		return filtered;
	},

	/**
	 * Transform raw data to metrics format.
	 *
	 * Expects each raw record to have the standard metric fields.
	 */
	transform(raw: RawData[]): TransformedMetric[] {
		const metrics: TransformedMetric[] = [];

		for (const record of raw) {
			const data = record.data as {
				metricType?: string;
				metricKey?: string;
				value?: number | string;
				dimensions?: Record<string, string>;
				periodType?: string;
				periodStart?: string;
				periodEnd?: string;
				metadata?: Record<string, unknown>;
			};

			// Skip records missing required fields
			if (!data.metricType || !data.metricKey || data.value === undefined) {
				log.debug(
					{ data },
					'Skipping record missing required fields'
				);
				continue;
			}

			// Parse dates
			let periodStart: Date;
			let periodEnd: Date;

			try {
				periodStart = data.periodStart ? new Date(data.periodStart) : record.timestamp;
				periodEnd = data.periodEnd ? new Date(data.periodEnd) : record.timestamp;
			} catch {
				log.warn({ periodStart: data.periodStart, periodEnd: data.periodEnd }, 'Invalid dates');
				continue;
			}

			// Parse value
			const value = typeof data.value === 'string' ? parseFloat(data.value) : data.value;

			// Determine period type
			let periodType: MetricPeriodType = 'daily';
			if (data.periodType && VALID_PERIOD_TYPES.includes(data.periodType as MetricPeriodType)) {
				periodType = data.periodType as MetricPeriodType;
			}

			metrics.push({
				metricType: data.metricType,
				metricKey: data.metricKey,
				value,
				dimensions: data.dimensions || {},
				periodType,
				periodStart,
				periodEnd,
				metadata: {
					...data.metadata,
					importedAt: record.timestamp.toISOString(),
					importSource: record.source
				}
			});
		}

		log.debug(
			{
				inputRecords: raw.length,
				outputMetrics: metrics.length
			},
			'Transformed manual data to metrics'
		);

		return metrics;
	},

	/**
	 * Validate transformed metrics.
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
			if (!metric.periodStart || isNaN(metric.periodStart.getTime())) {
				issues.push('Invalid periodStart date');
			}
			if (!metric.periodEnd || isNaN(metric.periodEnd.getTime())) {
				issues.push('Invalid periodEnd date');
			}
			if (!VALID_PERIOD_TYPES.includes(metric.periodType)) {
				issues.push(`Invalid periodType: ${metric.periodType}`);
			}

			// Check for date sanity
			if (metric.periodStart && metric.periodEnd && metric.periodStart > metric.periodEnd) {
				issues.push('periodStart is after periodEnd');
			}

			// Check for suspicious values (warnings only)
			if (metric.value < 0) {
				warnings.push(
					`Metric ${i} (${metric.metricType}/${metric.metricKey}) has negative value: ${metric.value}`
				);
			}
			if (metric.value > 1000000) {
				warnings.push(
					`Metric ${i} (${metric.metricType}/${metric.metricKey}) has unusually large value: ${metric.value}`
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
 * Convenience function to import CSV data directly.
 *
 * @param csvContent - CSV string content
 * @param sourceName - Source name for tracking
 * @returns Validation result and transformed metrics
 */
export function importCSV(
	csvContent: string,
	sourceName: string = 'csv-import'
): { metrics: TransformedMetric[]; validation: ValidationResult } {
	const rawData = parseCSV(csvContent, sourceName);
	const metrics = manualSource.transform(rawData);
	const validation = manualSource.validate(metrics);

	return { metrics, validation };
}

/**
 * Convenience function to import JSON data directly.
 *
 * @param jsonContent - JSON string or object
 * @param sourceName - Source name for tracking
 * @returns Validation result and transformed metrics
 */
export function importJSON(
	jsonContent: string | unknown,
	sourceName: string = 'json-import'
): { metrics: TransformedMetric[]; validation: ValidationResult } {
	const rawData = parseJSON(jsonContent, sourceName);
	const metrics = manualSource.transform(rawData);
	const validation = manualSource.validate(metrics);

	return { metrics, validation };
}

export default manualSource;
