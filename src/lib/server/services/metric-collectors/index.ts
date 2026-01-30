/**
 * @module Services/MetricCollectors
 * @description Registry and orchestration for metric collectors.
 *
 * This module provides a centralized registry for metric collectors and
 * orchestration functions to run them. Collectors can be registered,
 * queried, and executed individually or in batch.
 *
 * Usage:
 * ```typescript
 * import { registerCollector, runAllCollectors } from '$lib/server/services/metric-collectors';
 * import { teamTimeCollector } from './teamtime-collector';
 *
 * // Register collectors
 * registerCollector(teamTimeCollector);
 *
 * // Run all collectors for a date range
 * const result = await runAllCollectors({
 *   start: new Date('2025-01-01'),
 *   end: new Date('2025-01-31')
 * });
 * ```
 */

import { createLogger } from '$lib/server/logger';
import type {
	MetricCollector,
	DateRange,
	CollectedMetric,
	CollectionResult,
	CollectionOptions
} from './types';

const log = createLogger('services:metric-collectors');

// Registry of all metric collectors
const collectors: Map<string, MetricCollector> = new Map();

/**
 * Register a metric collector with the registry.
 *
 * @param collector - The collector to register
 * @throws Error if a collector with the same name already exists
 */
export function registerCollector(collector: MetricCollector): void {
	if (collectors.has(collector.name)) {
		throw new Error(`Collector '${collector.name}' is already registered`);
	}

	log.info({ collectorName: collector.name, metricTypes: collector.metricTypes }, 'Registering metric collector');
	collectors.set(collector.name, collector);
}

/**
 * Unregister a metric collector from the registry.
 *
 * @param name - The name of the collector to unregister
 * @returns True if the collector was found and removed, false otherwise
 */
export function unregisterCollector(name: string): boolean {
	const removed = collectors.delete(name);
	if (removed) {
		log.info({ collectorName: name }, 'Unregistered metric collector');
	}
	return removed;
}

/**
 * Get a collector by name.
 *
 * @param name - The name of the collector to retrieve
 * @returns The collector if found, undefined otherwise
 */
export function getCollector(name: string): MetricCollector | undefined {
	return collectors.get(name);
}

/**
 * Get all registered collectors.
 *
 * @returns Array of all registered collectors
 */
export function getAllCollectors(): MetricCollector[] {
	return Array.from(collectors.values());
}

/**
 * Get all collector names.
 *
 * @returns Array of all registered collector names
 */
export function getCollectorNames(): string[] {
	return Array.from(collectors.keys());
}

/**
 * Get all available metric types across all collectors.
 *
 * @returns Array of unique metric types
 */
export function getAllMetricTypes(): string[] {
	const types = new Set<string>();
	for (const collector of collectors.values()) {
		for (const metricType of collector.metricTypes) {
			types.add(metricType);
		}
	}
	return Array.from(types);
}

/**
 * Find collectors that provide a specific metric type.
 *
 * @param metricType - The metric type to search for
 * @returns Array of collectors that provide this metric type
 */
export function getCollectorsForMetricType(metricType: string): MetricCollector[] {
	return getAllCollectors().filter(c => c.metricTypes.includes(metricType));
}

/**
 * Run a single collector and collect metrics.
 *
 * @param collectorName - Name of the collector to run
 * @param dateRange - Date range to collect metrics for
 * @returns Array of collected metrics
 * @throws Error if collector not found
 */
export async function runCollector(
	collectorName: string,
	dateRange: DateRange
): Promise<CollectedMetric[]> {
	const collector = collectors.get(collectorName);
	if (!collector) {
		throw new Error(`Collector '${collectorName}' not found`);
	}

	log.debug({
		collectorName,
		startDate: dateRange.start.toISOString(),
		endDate: dateRange.end.toISOString()
	}, 'Running collector');

	const startTime = performance.now();
	try {
		const metrics = await collector.collect(dateRange);
		const duration = performance.now() - startTime;

		log.info({
			collectorName,
			metricsCount: metrics.length,
			durationMs: Math.round(duration)
		}, 'Collector completed');

		return metrics;
	} catch (error) {
		const duration = performance.now() - startTime;
		log.error({
			collectorName,
			durationMs: Math.round(duration),
			error: error instanceof Error ? error.message : String(error)
		}, 'Collector failed');
		throw error;
	}
}

/**
 * Run all registered collectors and combine their metrics.
 *
 * @param dateRange - Date range to collect metrics for
 * @param options - Collection options
 * @returns Combined result from all collectors
 */
export async function runAllCollectors(
	dateRange: DateRange,
	options: CollectionOptions = {}
): Promise<CollectionResult> {
	const {
		collectors: collectorNames,
		metricTypes,
		continueOnError = true
	} = options;

	const startTime = performance.now();
	const allMetrics: CollectedMetric[] = [];
	const byCollector: CollectionResult['byCollector'] = {};

	// Determine which collectors to run
	let collectorsToRun = getAllCollectors();

	// Filter by collector names if specified
	if (collectorNames && collectorNames.length > 0) {
		collectorsToRun = collectorsToRun.filter(c => collectorNames.includes(c.name));
	}

	// Filter by metric types if specified
	if (metricTypes && metricTypes.length > 0) {
		collectorsToRun = collectorsToRun.filter(c =>
			c.metricTypes.some(mt => metricTypes.includes(mt))
		);
	}

	log.info({
		collectorCount: collectorsToRun.length,
		collectorNames: collectorsToRun.map(c => c.name),
		startDate: dateRange.start.toISOString(),
		endDate: dateRange.end.toISOString()
	}, 'Running metric collectors');

	// Run each collector
	for (const collector of collectorsToRun) {
		const collectorStart = performance.now();
		const errors: string[] = [];

		try {
			let metrics = await collector.collect(dateRange);

			// Filter by metric types if specified
			if (metricTypes && metricTypes.length > 0) {
				metrics = metrics.filter(m => metricTypes.includes(m.metricType));
			}

			allMetrics.push(...metrics);
			byCollector[collector.name] = {
				metricsCount: metrics.length,
				duration: Math.round(performance.now() - collectorStart),
				errors
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			errors.push(errorMessage);
			byCollector[collector.name] = {
				metricsCount: 0,
				duration: Math.round(performance.now() - collectorStart),
				errors
			};

			log.error({
				collectorName: collector.name,
				error: errorMessage
			}, 'Collector failed during batch run');

			if (!continueOnError) {
				throw error;
			}
		}
	}

	const totalDuration = Math.round(performance.now() - startTime);

	log.info({
		totalMetrics: allMetrics.length,
		totalDurationMs: totalDuration,
		collectorResults: Object.entries(byCollector).map(([name, result]) => ({
			name,
			metrics: result.metricsCount,
			errors: result.errors.length
		}))
	}, 'Metric collection completed');

	return {
		totalMetrics: allMetrics.length,
		byCollector,
		metrics: allMetrics,
		durationMs: totalDuration
	};
}

/**
 * Clear all registered collectors.
 * Mainly useful for testing.
 */
export function clearCollectors(): void {
	collectors.clear();
	log.debug('Cleared all collectors');
}

// Re-export types
export * from './types';
