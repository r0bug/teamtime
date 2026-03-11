// Sales Import via NRS REST API - Replaces Python scraper chain
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, salesSnapshots, salesTransactions } from '$lib/server/db';
import { getDailyVendorSales } from '$lib/server/services/nrs-api-client';
import { createLogger } from '$lib/server/logger';
import { CRON_SECRET } from '$env/static/private';
import { eq } from 'drizzle-orm';

const log = createLogger('api:sales:import-nrs');

// POST - Import sales for a date via the NRS API
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		// Auth: same pattern as existing /api/sales/import
		const authHeader = request.headers.get('Authorization');
		const apiKey = authHeader?.replace('Bearer ', '');

		if (!apiKey || apiKey !== CRON_SECRET) {
			log.warn('Unauthorized NRS API import attempt');
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		// Optional date param (YYYY-MM-DD), defaults to today Pacific
		let date = url.searchParams.get('date');
		if (!date) {
			try {
				const body = await request.json();
				date = body.date;
			} catch {
				// No body - use today
			}
		}

		if (!date) {
			// Default to today in Pacific time
			const now = new Date();
			date = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'America/Los_Angeles',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(now); // en-CA format is YYYY-MM-DD
		}

		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ success: false, error: `Invalid date format: ${date}. Expected YYYY-MM-DD` }, { status: 400 });
		}

		log.info({ date }, 'Starting NRS API sales import');

		// Fetch and aggregate from NRS API
		const result = await getDailyVendorSales(date);

		if (result.vendors.length === 0) {
			log.info({ date }, 'No vendor sales data from NRS API');
			return json({
				success: true,
				message: 'No sales data found for this date',
				date,
				vendorCount: 0
			});
		}

		// Insert snapshot
		const [snapshot] = await db
			.insert(salesSnapshots)
			.values({
				saleDate: date,
				totalSales: result.totals.total_sales.toString(),
				totalVendorAmount: result.totals.total_vendor_amount.toString(),
				totalRetained: result.totals.total_retained.toString(),
				vendorCount: result.totals.vendor_count,
				vendors: result.vendors,
				source: 'nrs_api'
			})
			.returning({ id: salesSnapshots.id, capturedAt: salesSnapshots.capturedAt });

		// Store individual transactions for drill-down views
		if (result.records.length > 0) {
			// Delete existing transactions for this date (idempotent re-import)
			await db.delete(salesTransactions).where(eq(salesTransactions.invoiceDate, date));

			// Insert in batches of 100
			const txRows = result.records
				.filter(r => r.vendorId && r.vendorId !== 0)
				.map(r => ({
					arCashRegId: r.arCashRegId,
					arCashRegDetailId: r.arCashRegDetailId,
					storeId: r.storeId,
					storeName: r.storeName || null,
					invoiceDate: date,
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

			log.info({ transactionCount: txRows.length, date }, 'Stored individual sales transactions');
		}

		log.info({
			snapshotId: snapshot.id,
			saleDate: date,
			totalSales: result.totals.total_sales,
			totalRetained: result.totals.total_retained,
			vendorCount: result.totals.vendor_count,
			transactionCount: result.transactionCount
		}, 'Sales snapshot imported via NRS API');

		return json({
			success: true,
			snapshot: {
				id: snapshot.id,
				saleDate: date,
				capturedAt: snapshot.capturedAt,
				totalSales: result.totals.total_sales,
				totalRetained: result.totals.total_retained,
				vendorCount: result.totals.vendor_count,
				transactionCount: result.transactionCount
			}
		});
	} catch (error) {
		log.error({ error }, 'NRS API sales import error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
