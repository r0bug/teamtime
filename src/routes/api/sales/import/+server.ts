// Sales Import API - Receive sales data from external scraper
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, salesSnapshots, type VendorSalesData } from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import { CRON_SECRET } from '$env/static/private';

const log = createLogger('api:sales:import');

// Expected format from scraper
interface ScraperInput {
	date: string; // "MM/DD/YYYY" or "YYYY-MM-DD"
	vendors: {
		vendor_id: string;
		vendor_name: string;
		total_sales: number;
		vendor_amount: number;
		retained_amount: number;
	}[];
	totals: {
		total_sales: number;
		total_vendor_amount: number;
		total_retained: number;
		vendor_count: number;
	};
}

// Parse date from various formats
function parseDate(dateStr: string): string {
	// Try MM/DD/YYYY format
	const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (slashMatch) {
		const [, month, day, year] = slashMatch;
		return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	}

	// Try YYYY-MM-DD format (already correct)
	const dashMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
	if (dashMatch) {
		return dateStr;
	}

	throw new Error(`Invalid date format: ${dateStr}. Expected MM/DD/YYYY or YYYY-MM-DD`);
}

// POST - Import sales data from scraper
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Check for API key authorization
		const authHeader = request.headers.get('Authorization');
		const apiKey = authHeader?.replace('Bearer ', '');

		// Allow either CRON_SECRET or authenticated admin user
		// For now, just require CRON_SECRET since this is machine-to-machine
		if (!apiKey || apiKey !== CRON_SECRET) {
			log.warn('Unauthorized sales import attempt');
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body: ScraperInput = await request.json();

		// Validate required fields
		if (!body.date) {
			return json({ success: false, error: 'Missing date field' }, { status: 400 });
		}
		if (!body.vendors || !Array.isArray(body.vendors)) {
			return json({ success: false, error: 'Missing or invalid vendors array' }, { status: 400 });
		}
		if (!body.totals) {
			return json({ success: false, error: 'Missing totals object' }, { status: 400 });
		}

		// Parse the date
		const saleDate = parseDate(body.date);

		// Transform vendors to our format
		const vendors: VendorSalesData[] = body.vendors.map(v => ({
			vendor_id: v.vendor_id,
			vendor_name: v.vendor_name,
			total_sales: v.total_sales,
			vendor_amount: v.vendor_amount,
			retained_amount: v.retained_amount
		}));

		// Insert the snapshot
		const [snapshot] = await db
			.insert(salesSnapshots)
			.values({
				saleDate,
				totalSales: body.totals.total_sales.toString(),
				totalVendorAmount: body.totals.total_vendor_amount.toString(),
				totalRetained: body.totals.total_retained.toString(),
				vendorCount: body.totals.vendor_count,
				vendors,
				source: 'scraper'
			})
			.returning({ id: salesSnapshots.id, capturedAt: salesSnapshots.capturedAt });

		log.info({
			snapshotId: snapshot.id,
			saleDate,
			totalRetained: body.totals.total_retained,
			vendorCount: body.totals.vendor_count
		}, 'Sales snapshot imported');

		return json({
			success: true,
			snapshot: {
				id: snapshot.id,
				saleDate,
				capturedAt: snapshot.capturedAt,
				totalSales: body.totals.total_sales,
				totalRetained: body.totals.total_retained,
				vendorCount: body.totals.vendor_count
			}
		});
	} catch (error) {
		log.error({ error }, 'Sales import error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
