import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, salesSnapshots } from '$lib/server/db';
import { desc, sql, count } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const perPage = 50;
	const offset = (page - 1) * perPage;

	// Get all snapshots with pagination (most recent first)
	const snapshots = await db
		.select({
			id: salesSnapshots.id,
			saleDate: salesSnapshots.saleDate,
			capturedAt: salesSnapshots.capturedAt,
			totalSales: salesSnapshots.totalSales,
			totalVendorAmount: salesSnapshots.totalVendorAmount,
			totalRetained: salesSnapshots.totalRetained,
			vendorCount: salesSnapshots.vendorCount,
			source: salesSnapshots.source,
			aiRunId: salesSnapshots.aiRunId
		})
		.from(salesSnapshots)
		.orderBy(desc(salesSnapshots.capturedAt))
		.limit(perPage)
		.offset(offset);

	// Get total count
	const [{ total }] = await db
		.select({ total: count() })
		.from(salesSnapshots);

	// Get scrape stats: how many per source, date range, and frequency
	const sourceStats = await db
		.select({
			source: salesSnapshots.source,
			scrapeCount: count(),
			firstScrape: sql<string>`min(${salesSnapshots.capturedAt})`,
			lastScrape: sql<string>`max(${salesSnapshots.capturedAt})`,
			earliestDate: sql<string>`min(${salesSnapshots.saleDate})`,
			latestDate: sql<string>`max(${salesSnapshots.saleDate})`,
			totalSalesSum: sql<string>`sum(${salesSnapshots.totalSales}::numeric)`,
			totalRetainedSum: sql<string>`sum(${salesSnapshots.totalRetained}::numeric)`,
			avgVendorCount: sql<string>`round(avg(${salesSnapshots.vendorCount}), 1)`
		})
		.from(salesSnapshots)
		.groupBy(salesSnapshots.source);

	// Get unique sale dates count
	const [{ uniqueDays }] = await db
		.select({
			uniqueDays: sql<number>`count(distinct ${salesSnapshots.saleDate})`
		})
		.from(salesSnapshots);

	// Get daily scrape frequency (scrapes per day over last 30 days)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const dailyScrapes = await db
		.select({
			date: sql<string>`${salesSnapshots.saleDate}`,
			scrapeCount: count(),
			lastCaptured: sql<string>`max(${salesSnapshots.capturedAt})`
		})
		.from(salesSnapshots)
		.where(sql`${salesSnapshots.capturedAt} >= ${thirtyDaysAgo}`)
		.groupBy(salesSnapshots.saleDate)
		.orderBy(desc(salesSnapshots.saleDate));

	// Detect gaps in data (days with no scrape in last 30 days)
	const scrapesDates = new Set(dailyScrapes.map(d => d.date));
	const gaps: string[] = [];
	const now = new Date();
	for (let i = 1; i <= 30; i++) {
		const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
		// Skip Sundays (day 0) - store likely closed
		if (d.getDay() === 0) continue;
		const dateStr = d.toISOString().split('T')[0];
		if (!scrapesDates.has(dateStr)) {
			gaps.push(dateStr);
		}
	}

	return {
		snapshots: snapshots.map(s => ({
			...s,
			totalSales: parseFloat(s.totalSales),
			totalVendorAmount: parseFloat(s.totalVendorAmount),
			totalRetained: parseFloat(s.totalRetained),
			capturedAt: s.capturedAt.toISOString()
		})),
		pagination: {
			page,
			perPage,
			total,
			totalPages: Math.ceil(total / perPage)
		},
		sourceStats: sourceStats.map(s => ({
			source: s.source || 'unknown',
			scrapeCount: s.scrapeCount,
			firstScrape: s.firstScrape,
			lastScrape: s.lastScrape,
			earliestDate: s.earliestDate,
			latestDate: s.latestDate,
			totalSales: parseFloat(s.totalSalesSum || '0'),
			totalRetained: parseFloat(s.totalRetainedSum || '0'),
			avgVendorCount: parseFloat(s.avgVendorCount || '0')
		})),
		uniqueDays,
		dailyScrapes: dailyScrapes.map(d => ({
			date: d.date,
			scrapeCount: d.scrapeCount,
			lastCaptured: d.lastCaptured
		})),
		gaps
	};
};
