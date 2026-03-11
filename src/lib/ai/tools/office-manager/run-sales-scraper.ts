// Run Sales Scraper Tool - Allows Office Manager AI to trigger the NRS sales import
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { db, salesSnapshots, salesTransactions, type VendorSalesData } from '$lib/server/db';
import { getDailyVendorSales } from '$lib/server/services/nrs-api-client';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const execFileAsync = promisify(execFile);
const log = createLogger('ai:tools:run-sales-scraper');

interface RunSalesScraperParams {
	date?: string; // YYYY-MM-DD, defaults to today
	method?: 'scraper' | 'api'; // default: 'scraper' (switch to 'api' after validation)
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

async function executeViaApi(targetDate: string): Promise<RunSalesScraperResult> {
	try {
		log.info({ date: targetDate }, 'Importing sales via NRS API');

		const result = await getDailyVendorSales(targetDate);

		if (result.vendors.length === 0) {
			return {
				success: false,
				date: targetDate,
				error: 'No vendor sales data found for this date'
			};
		}

		const [snapshot] = await db
			.insert(salesSnapshots)
			.values({
				saleDate: targetDate,
				totalSales: result.totals.total_sales.toString(),
				totalVendorAmount: result.totals.total_vendor_amount.toString(),
				totalRetained: result.totals.total_retained.toString(),
				vendorCount: result.totals.vendor_count,
				vendors: result.vendors,
				source: 'nrs_api'
			})
			.returning({ id: salesSnapshots.id });

		// Store individual transactions for drill-down
		if (result.records.length > 0) {
			await db.delete(salesTransactions).where(eq(salesTransactions.invoiceDate, targetDate));

			const txRows = result.records
				.filter(r => r.vendorId && r.vendorId !== 0)
				.map(r => ({
					arCashRegId: r.arCashRegId,
					arCashRegDetailId: r.arCashRegDetailId,
					storeId: r.storeId,
					storeName: r.storeName || null,
					invoiceDate: targetDate,
					createDateTime: new Date(r.createDateTime),
					vendorId: r.vendorId,
					vendorName: r.vendorName || null,
					partId: r.partId || null,
					partNumber: r.partNumber || null,
					partName: r.partName || null,
					itemDescription: r.itemDescription || '',
					quantity: r.quantity || 1,
					price: String(r.price || 0),
					totalPrice: String(r.totalPrice || 0),
					tax: String(r.tax || 0),
					discountAmount: String(r.discountAmount || 0),
					vendorPortionOfTotalPrice: String(r.vendorPortionOfTotalPrice || 0),
					retainedAmountFromVendor: String(r.retainedAmountFromVendor || 0),
					userName: r.userName || null
				}));

			for (let i = 0; i < txRows.length; i += 100) {
				await db.insert(salesTransactions).values(txRows.slice(i, i + 100));
			}
		}

		log.info({
			snapshotId: snapshot.id,
			date: targetDate,
			totalSales: result.totals.total_sales,
			vendorCount: result.totals.vendor_count
		}, 'Sales snapshot imported via NRS API (AI tool)');

		return {
			success: true,
			date: targetDate,
			totalSales: result.totals.total_sales,
			totalRetained: result.totals.total_retained,
			vendorCount: result.totals.vendor_count,
			snapshotId: snapshot.id
		};
	} catch (error) {
		log.error({ error, date: targetDate }, 'NRS API import error');
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error calling NRS API'
		};
	}
}

async function executeViaScraper(targetDate: string): Promise<RunSalesScraperResult> {
	const scraperDate = toScraperDateFormat(targetDate);

	try {
		const projectRoot = path.resolve(process.cwd());
		const scraperPath = path.join(projectRoot, 'scraper-imports', 'nrs_daily_vendor_sales.py');
		const credsPath = path.join(projectRoot, 'scraper-imports', 'nrscreds.secret');

		log.info({ date: scraperDate, scraperPath }, 'Running NRS sales scraper');

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
		}, 'Sales snapshot imported via AI tool (scraper)');

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
}

export const runSalesScraperTool: AITool<RunSalesScraperParams, RunSalesScraperResult> = {
	name: 'run_sales_scraper',
	description: 'Import NRS daily vendor sales data for a specific date. Supports two methods: "api" (NRS REST API, preferred) or "scraper" (legacy Python web scraper). Stores the snapshot in the database.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'Date to import in YYYY-MM-DD format. Defaults to today if not specified.'
			},
			method: {
				type: 'string',
				enum: ['scraper', 'api'],
				description: 'Import method. "api" uses NRS REST API (faster, no Python needed). "scraper" uses legacy Python web scraper. Defaults to "scraper".'
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
		const method = params.method || 'scraper';
		return `Import NRS sales for ${dateStr} via ${method}? This will fetch vendor sales data and store it in the database.`;
	},

	validate(params: RunSalesScraperParams) {
		if (params.date) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.date)) {
				return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
			}

			const parsedDate = new Date(params.date + 'T12:00:00');
			if (isNaN(parsedDate.getTime())) {
				return { valid: false, error: 'Invalid date' };
			}

			const today = new Date();
			today.setHours(23, 59, 59, 999);
			if (parsedDate > today) {
				return { valid: false, error: 'Cannot import future dates' };
			}

			const ninetyDaysAgo = new Date();
			ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
			ninetyDaysAgo.setHours(0, 0, 0, 0);
			if (parsedDate < ninetyDaysAgo) {
				return { valid: false, error: 'Cannot import dates older than 90 days' };
			}
		}

		return { valid: true };
	},

	async execute(params: RunSalesScraperParams, context: ToolExecutionContext): Promise<RunSalesScraperResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - import would be executed'
			};
		}

		const targetDate = params.date || new Date().toISOString().split('T')[0];
		const method = params.method || 'scraper';

		if (method === 'api') {
			return executeViaApi(targetDate);
		}
		return executeViaScraper(targetDate);
	},

	formatResult(result: RunSalesScraperResult): string {
		if (result.success) {
			return `Sales imported for ${result.date}: $${result.totalSales?.toFixed(2)} total sales, $${result.totalRetained?.toFixed(2)} retained, ${result.vendorCount} vendors`;
		}
		return `Sales import failed: ${result.error}`;
	}
};
