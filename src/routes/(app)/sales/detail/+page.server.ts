// Sales Detail - Server-side data for drill-down views (hourly, vendor, item)
import type { PageServerLoad } from './$types';
import { db, salesTransactions } from '$lib/server/db';
import { eq, gte, lte, and, sql, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const date = url.searchParams.get('date');
	const vendorId = url.searchParams.get('vendorId');

	// Default to today if no date
	const targetDate = date || new Date().toISOString().split('T')[0];

	// Build conditions
	const conditions = [eq(salesTransactions.invoiceDate, targetDate)];
	if (vendorId) {
		conditions.push(eq(salesTransactions.vendorId, parseInt(vendorId, 10)));
	}

	const where = and(...conditions);

	// Hourly aggregation
	const hourlyData = await db
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

	// Vendor aggregation (for this date, regardless of vendorId filter)
	const dateCondition = eq(salesTransactions.invoiceDate, targetDate);
	const vendorData = await db
		.select({
			vendorId: salesTransactions.vendorId,
			vendorName: sql<string>`MAX(${salesTransactions.vendorName})`.as('vendor_name'),
			totalSales: sql<string>`SUM(${salesTransactions.totalPrice}::numeric)`.as('total_sales'),
			vendorPortion: sql<string>`SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric)`.as('vendor_portion'),
			retained: sql<string>`SUM(${salesTransactions.retainedAmountFromVendor}::numeric)`.as('retained'),
			itemCount: sql<number>`COUNT(*)`.as('item_count')
		})
		.from(salesTransactions)
		.where(dateCondition)
		.groupBy(salesTransactions.vendorId)
		.orderBy(sql`SUM(${salesTransactions.totalPrice}::numeric) DESC`);

	// Recent individual items (top 50)
	const items = await db
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
		.limit(50);

	// Totals for the day
	const [dayTotals] = await db
		.select({
			totalSales: sql<string>`COALESCE(SUM(${salesTransactions.totalPrice}::numeric), 0)`.as('total_sales'),
			vendorPortion: sql<string>`COALESCE(SUM(${salesTransactions.vendorPortionOfTotalPrice}::numeric), 0)`.as('vendor_portion'),
			retained: sql<string>`COALESCE(SUM(${salesTransactions.retainedAmountFromVendor}::numeric), 0)`.as('retained'),
			itemCount: sql<number>`COUNT(*)`.as('item_count'),
			vendorCount: sql<number>`COUNT(DISTINCT ${salesTransactions.vendorId})`.as('vendor_count')
		})
		.from(salesTransactions)
		.where(where);

	// Available dates (for date picker navigation)
	const availableDates = await db
		.selectDistinct({ date: salesTransactions.invoiceDate })
		.from(salesTransactions)
		.orderBy(desc(salesTransactions.invoiceDate))
		.limit(30);

	return {
		date: targetDate,
		selectedVendorId: vendorId ? parseInt(vendorId, 10) : null,
		hourly: hourlyData.map(r => ({
			hour: Number(r.hour),
			totalSales: parseFloat(r.totalSales),
			vendorPortion: parseFloat(r.vendorPortion),
			retained: parseFloat(r.retained),
			itemCount: Number(r.itemCount),
			vendorCount: Number(r.vendorCount)
		})),
		vendors: vendorData.map(r => ({
			vendorId: r.vendorId,
			vendorName: r.vendorName,
			totalSales: parseFloat(r.totalSales),
			vendorPortion: parseFloat(r.vendorPortion),
			retained: parseFloat(r.retained),
			itemCount: Number(r.itemCount)
		})),
		items: items.map(r => ({
			id: r.id,
			time: r.createDateTime?.toISOString() || '',
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
		})),
		totals: {
			totalSales: parseFloat(dayTotals.totalSales),
			vendorPortion: parseFloat(dayTotals.vendorPortion),
			retained: parseFloat(dayTotals.retained),
			itemCount: Number(dayTotals.itemCount),
			vendorCount: Number(dayTotals.vendorCount)
		},
		availableDates: availableDates.map(d => d.date as string)
	};
};
