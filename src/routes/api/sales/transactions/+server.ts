// Sales Transactions API - Query individual POS line items for drill-down views
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, salesTransactions } from '$lib/server/db';
import { eq, gte, lte, and, sql, desc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:sales:transactions');

// GET - Query transactions with grouping options
// ?date=YYYY-MM-DD           Single day
// ?startDate=...&endDate=... Date range
// ?vendorId=123              Filter by vendor
// ?group=hourly              Group by hour (returns aggregates)
// ?group=vendor              Group by vendor (returns aggregates)
// ?group=item                Individual items (paginated)
// ?limit=50&offset=0         Pagination for item-level
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const date = url.searchParams.get('date');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const vendorId = url.searchParams.get('vendorId');
		const group = url.searchParams.get('group') || 'item';
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		// Build WHERE conditions
		const conditions = [];

		if (date) {
			conditions.push(eq(salesTransactions.invoiceDate, date));
		} else {
			if (startDate) conditions.push(gte(salesTransactions.invoiceDate, startDate));
			if (endDate) conditions.push(lte(salesTransactions.invoiceDate, endDate));
		}

		if (vendorId) {
			conditions.push(eq(salesTransactions.vendorId, parseInt(vendorId, 10)));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		if (group === 'hourly') {
			// Aggregate by hour
			const rows = await db
				.select({
					hour: sql<number>`EXTRACT(HOUR FROM ${salesTransactions.createDateTime})`.as('hour'),
					totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
					vendorPortion: sql<string>`SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric)`.as('vendor_portion'),
					retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
					itemCount: sql<number>`COUNT(*)`.as('item_count'),
					vendorCount: sql<number>`COUNT(DISTINCT ${salesTransactions.vendorId})`.as('vendor_count')
				})
				.from(salesTransactions)
				.where(where)
				.groupBy(sql`EXTRACT(HOUR FROM ${salesTransactions.createDateTime})`)
				.orderBy(sql`EXTRACT(HOUR FROM ${salesTransactions.createDateTime})`);

			return json({
				success: true,
				group: 'hourly',
				data: rows.map(r => ({
					hour: Number(r.hour),
					totalSales: parseFloat(r.totalSales),
					vendorPortion: parseFloat(r.vendorPortion),
					retained: parseFloat(r.retained),
					itemCount: Number(r.itemCount),
					vendorCount: Number(r.vendorCount)
				}))
			});
		}

		if (group === 'vendor') {
			// Aggregate by vendor
			const rows = await db
				.select({
					vendorId: salesTransactions.vendorId,
					vendorName: sql<string>`MAX(${salesTransactions.vendorName})`.as('vendor_name'),
					totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
					vendorPortion: sql<string>`SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric)`.as('vendor_portion'),
					retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
					itemCount: sql<number>`COUNT(*)`.as('item_count')
				})
				.from(salesTransactions)
				.where(where)
				.groupBy(salesTransactions.vendorId)
				.orderBy(sql`SUM(${salesTransactions.totalPrice}::numeric) DESC`);

			return json({
				success: true,
				group: 'vendor',
				data: rows.map(r => ({
					vendorId: r.vendorId,
					vendorName: r.vendorName,
					totalSales: parseFloat(r.totalSales),
					vendorPortion: parseFloat(r.vendorPortion),
					retained: parseFloat(r.retained),
					itemCount: Number(r.itemCount)
				}))
			});
		}

		if (group === 'vendor-hourly') {
			// Aggregate by vendor + hour (for heatmap)
			const rows = await db
				.select({
					vendorId: salesTransactions.vendorId,
					vendorName: sql<string>`MAX(${salesTransactions.vendorName})`.as('vendor_name'),
					hour: sql<number>`EXTRACT(HOUR FROM ${salesTransactions.createDateTime})`.as('hour'),
					totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
					retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
					itemCount: sql<number>`COUNT(*)`.as('item_count')
				})
				.from(salesTransactions)
				.where(where)
				.groupBy(salesTransactions.vendorId, sql`EXTRACT(HOUR FROM ${salesTransactions.createDateTime})`)
				.orderBy(sql`SUM(${salesTransactions.totalPrice}::numeric) DESC`);

			return json({
				success: true,
				group: 'vendor-hourly',
				data: rows.map(r => ({
					vendorId: r.vendorId,
					vendorName: r.vendorName,
					hour: Number(r.hour),
					totalSales: parseFloat(r.totalSales),
					retained: parseFloat(r.retained),
					itemCount: Number(r.itemCount)
				}))
			});
		}

		// Default: individual items
		const rows = await db
			.select({
				id: salesTransactions.id,
				createDateTime: salesTransactions.createDateTime,
				vendorId: salesTransactions.vendorId,
				vendorName: salesTransactions.vendorName,
				itemDescription: salesTransactions.itemDescription,
				partNumber: salesTransactions.partNumber,
				quantity: salesTransactions.quantity,
				price: salesTransactions.price,
				totalPrice: salesTransactions.totalPrice,
				vendorPortion: salesTransactions.vendorPortionOfTotalPrice,
				retained: salesTransactions.retainedAmountFromVendor,
				userName: salesTransactions.userName
			})
			.from(salesTransactions)
			.where(where)
			.orderBy(desc(salesTransactions.createDateTime))
			.limit(limit)
			.offset(offset);

		// Get total count for pagination
		const [countResult] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(salesTransactions)
			.where(where);

		return json({
			success: true,
			group: 'item',
			total: Number(countResult.count),
			limit,
			offset,
			data: rows.map(r => ({
				id: r.id,
				createDateTime: r.createDateTime,
				vendorId: r.vendorId,
				vendorName: r.vendorName,
				itemDescription: r.itemDescription,
				partNumber: r.partNumber,
				quantity: r.quantity,
				price: parseFloat(r.price),
				totalPrice: parseFloat(r.totalPrice),
				vendorPortion: parseFloat(r.vendorPortion),
				retained: parseFloat(r.retained),
				userName: r.userName
			}))
		});
	} catch (error) {
		log.error({ error }, 'Sales transactions query error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
