/**
 * Metrics Reports API Endpoint
 *
 * Generate various metrics reports with JSON or CSV output.
 * GET: Generate report based on reportType parameter
 *   - vendor-by-employee: Vendor sales pivoted by employee
 *   - employee-performance: Employee metrics summary
 *   - sales-trends: Sales trends with optional vendor/employee filter
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '$lib/server/logger';
import { isManager } from '$lib/server/auth/roles';
import {
	generateVendorByEmployeeReport,
	generateEmployeePerformanceReport,
	generateSalesTrendsReport
} from '$lib/server/services/metrics-service';
import { toPacificDateTimeString } from '$lib/server/utils/timezone';

const log = createLogger('api:metrics:reports');

// Helper to format date for CSV filename
function formatDateForFilename(date: Date): string {
	return date.toISOString().split('T')[0];
}

// Helper to escape CSV values
function escapeCSV(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

// Helper to convert array of objects to CSV
function toCSV(data: Record<string, unknown>[], headers?: string[]): string {
	if (data.length === 0) return '';

	const keys = headers || Object.keys(data[0]);
	const headerRow = keys.map(k => escapeCSV(k)).join(',');
	const rows = data.map(row =>
		keys.map(k => escapeCSV(row[k] as string | number | null)).join(',')
	);

	return [headerRow, ...rows].join('\n');
}

// GET - Generate report
export const GET: RequestHandler = async ({ locals, url }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	// Manager/admin access only for reports
	if (!isManager(locals.user)) {
		return json({
			success: false,
			error: 'Forbidden - Manager access required'
		}, { status: 403 });
	}

	try {
		// Parse query parameters
		const reportType = url.searchParams.get('reportType');
		const format = url.searchParams.get('format') || 'json';
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const userId = url.searchParams.get('userId');
		const vendorId = url.searchParams.get('vendorId');
		const groupBy = url.searchParams.get('groupBy') as 'day' | 'week' | 'month' | null;

		// Validate report type
		const validReportTypes = ['vendor-by-employee', 'employee-performance', 'sales-trends'];
		if (!reportType || !validReportTypes.includes(reportType)) {
			return json({
				success: false,
				error: `Invalid reportType. Must be one of: ${validReportTypes.join(', ')}`
			}, { status: 400 });
		}

		// Validate format
		if (!['json', 'csv'].includes(format)) {
			return json({
				success: false,
				error: 'Invalid format. Must be json or csv'
			}, { status: 400 });
		}

		// Build date range (default to last 30 days if not specified)
		const now = new Date();
		const defaultStart = new Date(now);
		defaultStart.setDate(defaultStart.getDate() - 30);

		const dateRange = {
			start: startDate ? new Date(startDate) : defaultStart,
			end: endDate ? new Date(endDate) : now
		};

		log.debug({
			reportType,
			format,
			dateRange,
			userId,
			vendorId,
			groupBy,
			requestingUserId: locals.user.id
		}, 'Report generation request');

		let reportData: Record<string, unknown>[];
		let filename: string;
		let csvHeaders: string[] | undefined;

		// Generate appropriate report
		switch (reportType) {
			case 'vendor-by-employee': {
				const result = await generateVendorByEmployeeReport({ dateRange, vendorId });
				reportData = result.data;
				filename = `vendor-by-employee-${formatDateForFilename(dateRange.start)}-to-${formatDateForFilename(dateRange.end)}`;
				csvHeaders = ['employeeName', 'employeeId', 'vendorName', 'vendorId', 'totalSales', 'totalRetained', 'shiftsWorked', 'hoursWorked', 'salesPerHour'];
				break;
			}

			case 'employee-performance': {
				const result = await generateEmployeePerformanceReport({ dateRange, userId });
				reportData = result.data;
				filename = `employee-performance-${formatDateForFilename(dateRange.start)}-to-${formatDateForFilename(dateRange.end)}`;
				csvHeaders = ['employeeName', 'employeeId', 'totalShifts', 'totalHours', 'totalSales', 'avgSalesPerShift', 'tasksCompleted', 'onTimeRate'];
				break;
			}

			case 'sales-trends': {
				const result = await generateSalesTrendsReport({
					dateRange,
					userId,
					vendorId,
					groupBy: groupBy || 'day'
				});
				reportData = result.data;
				filename = `sales-trends-${formatDateForFilename(dateRange.start)}-to-${formatDateForFilename(dateRange.end)}`;
				csvHeaders = ['period', 'totalSales', 'totalRetained', 'vendorCount', 'shiftsCount', 'avgSalesPerShift'];
				break;
			}

			default:
				return json({ success: false, error: 'Invalid report type' }, { status: 400 });
		}

		// Return as CSV
		if (format === 'csv') {
			const csv = toCSV(reportData, csvHeaders);
			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="${filename}.csv"`
				}
			});
		}

		// Return as JSON (default)
		return json({
			success: true,
			reportType,
			dateRange: {
				start: dateRange.start.toISOString(),
				end: dateRange.end.toISOString()
			},
			generatedAt: new Date().toISOString(),
			count: reportData.length,
			data: reportData
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Report generation error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
