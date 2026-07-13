// Sales Import via NRS REST API - Replaces Python scraper chain
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, salesSnapshots, salesTransactions } from '$lib/server/db';
import { getDailyVendorSales } from '$lib/server/services/nrs-api-client';
import { createLogger } from '$lib/server/logger';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { and, eq } from 'drizzle-orm';

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

		// Which NRS store to import. Defaults to the primary store (Yakima Finds,
		// NRS_STORE_ID/20). A ?storeId= lets us pull a second store (e.g. Yakima
		// Networking = 1) into sales_transactions without disturbing the primary.
		const primaryStoreId = parseInt(env.NRS_STORE_ID || '20', 10);
		const storeIdParam = url.searchParams.get('storeId');
		const storeId = storeIdParam ? parseInt(storeIdParam, 10) : primaryStoreId;
		if (Number.isNaN(storeId)) {
			return json({ success: false, error: `Invalid storeId: ${storeIdParam}` }, { status: 400 });
		}

		log.info({ date, storeId }, 'Starting NRS API sales import');

		// Fetch and aggregate from NRS API
		const result = await getDailyVendorSales(date, storeId);

		if (result.vendors.length === 0) {
			log.info({ date }, 'No vendor sales data from NRS API');
			return json({
				success: true,
				message: 'No sales data found for this date',
				date,
				vendorCount: 0
			});
		}

		// Insert the daily rollup snapshot ONLY for the primary store. The
		// sales_snapshots table has no store column (it predates multi-store), so
		// secondary stores like Yakima Networking are read from sales_transactions
		// instead — writing their totals here would corrupt the primary rollup.
		let snapshot: { id: string; capturedAt: Date } | null = null;
		if (storeId === primaryStoreId) {
			[snapshot] = await db
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
		}

		// Store individual transactions for drill-down / secondary-store views
		if (result.records.length > 0) {
			// Delete existing transactions for this date AND store only (idempotent
			// re-import). Scoping by store is required so importing one store never
			// wipes another store's rows for the same date.
			await db
				.delete(salesTransactions)
				.where(and(eq(salesTransactions.invoiceDate, date), eq(salesTransactions.storeId, storeId)));

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
			snapshotId: snapshot?.id ?? null,
			storeId,
			saleDate: date,
			totalSales: result.totals.total_sales,
			totalRetained: result.totals.total_retained,
			vendorCount: result.totals.vendor_count,
			transactionCount: result.transactionCount
		}, 'Sales imported via NRS API');

		return json({
			success: true,
			snapshot: {
				id: snapshot?.id ?? null,
				storeId,
				saleDate: date,
				capturedAt: snapshot?.capturedAt ?? null,
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
