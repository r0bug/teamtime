// Run Sales Scraper Tool - Allows Office Manager AI to trigger the NRS sales scraper
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { db, salesSnapshots, type VendorSalesData } from '$lib/server/db';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const execFileAsync = promisify(execFile);
const log = createLogger('ai:tools:run-sales-scraper');

interface RunSalesScraperParams {
	date?: string; // YYYY-MM-DD, defaults to today
}

interface RunSalesScraperResult {
	success: boolean;
	date?: string;
	totalSales?: number;
	totalRetained?: number;
	vendorCount?: number;
	snapshotId?: string;
	error?: string;
}

// Convert YYYY-MM-DD to MM/DD/YYYY for the Python scraper
function toScraperDateFormat(isoDate: string): string {
	const [year, month, day] = isoDate.split('-');
	return `${month}/${day}/${year}`;
}

export const runSalesScraperTool: AITool<RunSalesScraperParams, RunSalesScraperResult> = {
	name: 'run_sales_scraper',
	description: 'Run the NRS daily vendor sales scraper to import sales data for a specific date. Scrapes vendor sales from NRS accounting and stores the snapshot in the database.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'Date to scrape in YYYY-MM-DD format. Defaults to today if not specified.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		global: 20
	},
	rateLimit: {
		maxPerHour: 3
	},

	getConfirmationMessage(params: RunSalesScraperParams): string {
		const dateStr = params.date || 'today';
		return `Run the NRS sales scraper for ${dateStr}? This will fetch vendor sales data and store it in the database.`;
	},

	validate(params: RunSalesScraperParams) {
		if (params.date) {
			// Validate YYYY-MM-DD format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.date)) {
				return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
			}

			const parsedDate = new Date(params.date + 'T12:00:00');
			if (isNaN(parsedDate.getTime())) {
				return { valid: false, error: 'Invalid date' };
			}

			// Not in the future
			const today = new Date();
			today.setHours(23, 59, 59, 999);
			if (parsedDate > today) {
				return { valid: false, error: 'Cannot scrape future dates' };
			}

			// Not older than 90 days
			const ninetyDaysAgo = new Date();
			ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
			ninetyDaysAgo.setHours(0, 0, 0, 0);
			if (parsedDate < ninetyDaysAgo) {
				return { valid: false, error: 'Cannot scrape dates older than 90 days' };
			}
		}

		return { valid: true };
	},

	async execute(params: RunSalesScraperParams, context: ToolExecutionContext): Promise<RunSalesScraperResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - scraper would be executed'
			};
		}

		// Default to today
		const targetDate = params.date || new Date().toISOString().split('T')[0];
		const scraperDate = toScraperDateFormat(targetDate);

		try {
			// Resolve paths relative to project root
			const projectRoot = path.resolve(process.cwd());
			const scraperPath = path.join(projectRoot, 'scraper-imports', 'nrs_daily_vendor_sales.py');
			const credsPath = path.join(projectRoot, 'scraper-imports', 'nrscreds.secret');

			log.info({ date: scraperDate, scraperPath }, 'Running NRS sales scraper');

			// Execute the Python scraper via execFile (no shell injection risk)
			const { stdout, stderr } = await execFileAsync(
				'python3',
				[scraperPath, '--date', scraperDate, '--format', 'json', '--creds', credsPath],
				{
					timeout: 30000,
					cwd: projectRoot
				}
			);

			if (stderr) {
				log.warn({ stderr }, 'Scraper stderr output');
			}

			// Parse JSON output
			const data = JSON.parse(stdout.trim());

			if (!data.vendors || !data.totals) {
				return {
					success: false,
					error: 'Scraper returned unexpected format (missing vendors or totals)'
				};
			}

			if (data.vendors.length === 0) {
				return {
					success: false,
					date: targetDate,
					error: 'No vendor sales data found for this date'
				};
			}

			// Transform vendors to our format
			const vendors: VendorSalesData[] = data.vendors.map((v: {
				vendor_id: string;
				vendor_name: string;
				total_sales: number;
				vendor_amount: number;
				retained_amount: number;
			}) => ({
				vendor_id: v.vendor_id,
				vendor_name: v.vendor_name,
				total_sales: v.total_sales,
				vendor_amount: v.vendor_amount,
				retained_amount: v.retained_amount
			}));

			// Insert snapshot into database (matches sales/import/+server.ts pattern)
			const [snapshot] = await db
				.insert(salesSnapshots)
				.values({
					saleDate: targetDate,
					totalSales: data.totals.total_sales.toString(),
					totalVendorAmount: data.totals.total_vendor_amount.toString(),
					totalRetained: data.totals.total_retained.toString(),
					vendorCount: data.totals.vendor_count,
					vendors,
					source: 'scraper'
				})
				.returning({ id: salesSnapshots.id });

			log.info({
				snapshotId: snapshot.id,
				date: targetDate,
				totalSales: data.totals.total_sales,
				vendorCount: data.totals.vendor_count
			}, 'Sales snapshot imported via AI tool');

			return {
				success: true,
				date: targetDate,
				totalSales: data.totals.total_sales,
				totalRetained: data.totals.total_retained,
				vendorCount: data.totals.vendor_count,
				snapshotId: snapshot.id
			};
		} catch (error) {
			log.error({ error, date: targetDate }, 'Sales scraper error');

			if (error instanceof Error) {
				if (error.message.includes('TIMEOUT') || error.message.includes('timed out')) {
					return { success: false, error: 'Scraper timed out after 30 seconds' };
				}
				return { success: false, error: error.message };
			}

			return { success: false, error: 'Unknown error running scraper' };
		}
	},

	formatResult(result: RunSalesScraperResult): string {
		if (result.success) {
			return `Sales scraped for ${result.date}: $${result.totalSales?.toFixed(2)} total sales, $${result.totalRetained?.toFixed(2)} retained, ${result.vendorCount} vendors`;
		}
		return `Sales scraper failed: ${result.error}`;
	}
};
