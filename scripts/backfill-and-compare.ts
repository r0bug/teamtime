#!/usr/bin/env npx tsx
/**
 * Backfill & Compare: Fetch 3 months of NRS API data and compare against scraper snapshots.
 *
 * Usage:
 *   npx tsx scripts/backfill-and-compare.ts                    # Last 90 days
 *   npx tsx scripts/backfill-and-compare.ts --days 30          # Last 30 days
 *   npx tsx scripts/backfill-and-compare.ts --dry-run          # Compare only, don't store
 *   npx tsx scripts/backfill-and-compare.ts --start 2025-12-15 # From specific date
 */

import 'dotenv/config';
import postgres from 'postgres';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime';

if (!API_KEY) {
	console.error('ERROR: NRS_API_KEY not set in .env');
	process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
	const idx = args.indexOf(`--${name}`);
	return idx >= 0 ? args[idx + 1] : undefined;
}
const dryRun = args.includes('--dry-run');
const days = parseInt(getArg('days') || '90', 10);
const startArg = getArg('start');

const sql = postgres(DATABASE_URL);

// ── NRS API helpers ─────────────────────────────────────────────────────────

interface SaleRecord {
	arCashRegId: number;
	arCashRegDetailId: number;
	storeId: number;
	storeName: string;
	userName: string;
	invoiceDate: string;
	vendorId: number;
	vendorName: string | null;
	partId: number;
	partNumber: string | null;
	partName: string | null;
	itemDescription: string;
	quantity: number;
	price: number;
	totalPrice: number;
	tax: number;
	discountAmount: number;
	vendorPortionOfTotalPrice: number;
	retainedAmountFromVendor: number;
	createDateTime: string;
	[key: string]: unknown;
}

async function apiPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
	const resp = await fetch(`${API_BASE}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY! },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30000)
	});
	const data = await resp.json();
	if (data.err) {
		if (data.err.num === 203) return { list: [], nextPage: null } as T;
		throw new Error(`${endpoint}: err ${data.err.num} - ${data.err.msg}`);
	}
	return data;
}

async function fetchAllSales(storeId: number, invoiceDate: string): Promise<SaleRecord[]> {
	const all: SaleRecord[] = [];
	let page = 1;
	while (true) {
		const data = await apiPost<{ list?: SaleRecord[]; nextPage?: number | null }>('possales/getall', {
			storeId, invoiceDate, pagesize: 100, page
		});
		if (!data.list || data.list.length === 0) break;
		all.push(...data.list);
		if (!data.nextPage) break;
		page = data.nextPage;
		if (page > 500) break;
	}
	return all;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// ── Date range ──────────────────────────────────────────────────────────────

function getBusinessDays(startDate: Date, endDate: Date): string[] {
	const dates: string[] = [];
	const d = new Date(startDate);
	while (d <= endDate) {
		const dow = d.getDay();
		if (dow !== 0) { // Skip Sundays (store closed)
			dates.push(d.toISOString().split('T')[0]);
		}
		d.setDate(d.getDate() + 1);
	}
	return dates;
}

// ── Main ────────────────────────────────────────────────────────────────────

interface DayResult {
	date: string;
	apiSales: number;
	apiRetained: number;
	apiVendorAmt: number;
	apiVendorCount: number;
	apiItems: number;
	scraperSales: number | null;
	scraperRetained: number | null;
	scraperVendorAmt: number | null;
	scraperVendorCount: number | null;
	salesDiff: number | null;
	retainedDiff: number | null;
	match: boolean | null;
}

async function main() {
	console.log('='.repeat(70));
	console.log('  NRS API Backfill & Compare');
	console.log('='.repeat(70));
	console.log(`  Store ID:  ${STORE_ID}`);
	console.log(`  Dry run:   ${dryRun ? 'YES (no data stored)' : 'NO (will store transactions)'}`);

	// Calculate date range
	const endDate = new Date();
	endDate.setDate(endDate.getDate() - 1); // Yesterday
	let startDate: Date;
	if (startArg) {
		startDate = new Date(startArg + 'T12:00:00');
	} else {
		startDate = new Date();
		startDate.setDate(startDate.getDate() - days);
	}

	const businessDays = getBusinessDays(startDate, endDate);
	console.log(`  Range:     ${businessDays[0]} to ${businessDays[businessDays.length - 1]}`);
	console.log(`  Days:      ${businessDays.length} business days`);
	console.log('');

	// Load existing scraper snapshots for comparison
	const scraperRows = await sql`
		SELECT DISTINCT ON (sale_date)
			sale_date,
			total_sales::numeric as total_sales,
			total_vendor_amount::numeric as total_vendor_amount,
			total_retained::numeric as total_retained,
			vendor_count,
			vendors
		FROM sales_snapshots
		WHERE source = 'scraper'
		  AND sale_date >= ${businessDays[0]}
		  AND sale_date <= ${businessDays[businessDays.length - 1]}
		ORDER BY sale_date, captured_at DESC
	`;

	const scraperByDate = new Map<string, typeof scraperRows[0]>();
	for (const row of scraperRows) {
		// sale_date comes back as Date object from postgres driver
		const dateStr = row.sale_date instanceof Date
			? row.sale_date.toISOString().split('T')[0]
			: String(row.sale_date);
		scraperByDate.set(dateStr, row);
	}
	console.log(`  Scraper snapshots found: ${scraperByDate.size}`);
	console.log('');

	// Process each day
	const results: DayResult[] = [];
	let matched = 0;
	let mismatched = 0;
	let apiOnly = 0;
	let noData = 0;
	let errors = 0;

	for (let i = 0; i < businessDays.length; i++) {
		const date = businessDays[i];
		const progress = `[${i + 1}/${businessDays.length}]`;

		try {
			const records = await fetchAllSales(STORE_ID, date);

			if (records.length === 0) {
				process.stdout.write(`  ${progress} ${date}: no sales data\n`);
				noData++;
				continue;
			}

			// Aggregate by vendor
			let apiTotalSales = 0;
			let apiVendorAmt = 0;
			let apiRetained = 0;
			const vendorSet = new Set<number>();

			for (const r of records) {
				if (!r.vendorId || r.vendorId === 0) continue;
				apiTotalSales += r.totalPrice || 0;
				apiVendorAmt += r.vendorPortionOfTotalPrice || 0;
				apiRetained += r.retainedAmountFromVendor || 0;
				vendorSet.add(r.vendorId);
			}

			apiTotalSales = round2(apiTotalSales);
			apiVendorAmt = round2(apiVendorAmt);
			apiRetained = round2(apiRetained);

			// Compare with scraper
			const scraper = scraperByDate.get(date);
			let salesDiff: number | null = null;
			let retainedDiff: number | null = null;
			let isMatch: boolean | null = null;

			if (scraper) {
				const scSales = Number(scraper.total_sales);
				const scRetained = Number(scraper.total_retained);
				salesDiff = round2(apiTotalSales - scSales);
				retainedDiff = round2(apiRetained - scRetained);
				isMatch = Math.abs(salesDiff) < 0.02 && Math.abs(retainedDiff) < 0.02;

				if (isMatch) {
					matched++;
					process.stdout.write(`  ${progress} ${date}: ✓ MATCH  $${apiTotalSales.toFixed(2)} sales, $${apiRetained.toFixed(2)} retained (${records.length} items, ${vendorSet.size} vendors)\n`);
				} else {
					mismatched++;
					process.stdout.write(`  ${progress} ${date}: ✗ DIFF   API=$${apiTotalSales.toFixed(2)} vs Scraper=$${scSales.toFixed(2)} (sales diff: $${salesDiff.toFixed(2)}, retained diff: $${retainedDiff.toFixed(2)})\n`);
				}
			} else {
				apiOnly++;
				process.stdout.write(`  ${progress} ${date}: ~ API only  $${apiTotalSales.toFixed(2)} sales (no scraper data)\n`);
			}

			results.push({
				date,
				apiSales: apiTotalSales,
				apiRetained: apiRetained,
				apiVendorAmt: apiVendorAmt,
				apiVendorCount: vendorSet.size,
				apiItems: records.length,
				scraperSales: scraper ? Number(scraper.total_sales) : null,
				scraperRetained: scraper ? Number(scraper.total_retained) : null,
				scraperVendorAmt: scraper ? Number(scraper.total_vendor_amount) : null,
				scraperVendorCount: scraper ? Number(scraper.vendor_count) : null,
				salesDiff,
				retainedDiff,
				match: isMatch
			});

			// Store transactions (unless dry run)
			if (!dryRun && records.length > 0) {
				// Delete existing for this date
				await sql`DELETE FROM sales_transactions WHERE invoice_date = ${date}`;

				// Insert in batches
				const txRows = records
					.filter(r => r.vendorId && r.vendorId !== 0)
					.map(r => ({
						ar_cash_reg_id: r.arCashRegId,
						ar_cash_reg_detail_id: r.arCashRegDetailId,
						store_id: r.storeId,
						store_name: r.storeName || null,
						invoice_date: date,
						create_date_time: new Date(r.createDateTime),
						vendor_id: r.vendorId,
						vendor_name: r.vendorName || null,
						part_id: r.partId || null,
						part_number: r.partNumber || null,
						part_name: r.partName || null,
						item_description: r.itemDescription || '',
						quantity: r.quantity || 1,
						price: String(r.price || 0),
						total_price: String(r.totalPrice || 0),
						tax: String(r.tax || 0),
						discount_amount: String(r.discountAmount || 0),
						vendor_portion: String(r.vendorPortionOfTotalPrice || 0),
						retained_amount: String(r.retainedAmountFromVendor || 0),
						user_name: r.userName || null
					}));

				for (let b = 0; b < txRows.length; b += 50) {
					const batch = txRows.slice(b, b + 50);
					await sql`INSERT INTO sales_transactions ${sql(batch)}`;
				}
			}

			// Rate limit: small delay between days to not hammer the API
			if (i < businessDays.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 500));
			}

		} catch (err) {
			errors++;
			process.stdout.write(`  ${progress} ${date}: ✗ ERROR  ${err instanceof Error ? err.message : String(err)}\n`);
		}
	}

	// ── Summary ───────────────────────────────────────────────────────────────

	const compared = matched + mismatched;
	const matchRate = compared > 0 ? ((matched / compared) * 100).toFixed(1) : 'N/A';

	console.log('');
	console.log('='.repeat(70));
	console.log('  RESULTS');
	console.log('='.repeat(70));
	console.log(`  Days processed:  ${results.length}`);
	console.log(`  No sales data:   ${noData}`);
	console.log(`  Errors:          ${errors}`);
	console.log('');
	console.log(`  Compared (API vs Scraper):  ${compared} days`);
	console.log(`    ✓ Matched:     ${matched}`);
	console.log(`    ✗ Mismatched:  ${mismatched}`);
	console.log(`    Match rate:    ${matchRate}%`);
	console.log(`  API-only (no scraper data): ${apiOnly}`);
	console.log('');

	if (!dryRun) {
		const txCount = await sql`SELECT COUNT(*) as c FROM sales_transactions`;
		console.log(`  Transactions stored: ${txCount[0].c} total in database`);
	} else {
		console.log('  (Dry run — no transactions stored)');
	}

	// Show mismatches detail
	if (mismatched > 0) {
		console.log('');
		console.log('  MISMATCHES:');
		console.log(`  ${'Date'.padEnd(12)} ${'API Sales'.padStart(12)} ${'Scraper'.padStart(12)} ${'Diff'.padStart(10)} ${'Ret Diff'.padStart(10)}`);
		console.log(`  ${'-'.repeat(58)}`);
		for (const r of results.filter(r => r.match === false)) {
			console.log(`  ${r.date.padEnd(12)} $${r.apiSales.toFixed(2).padStart(11)} $${(r.scraperSales ?? 0).toFixed(2).padStart(11)} $${(r.salesDiff ?? 0).toFixed(2).padStart(9)} $${(r.retainedDiff ?? 0).toFixed(2).padStart(9)}`);
		}
	}

	// Verdict
	console.log('');
	console.log('='.repeat(70));
	if (compared === 0) {
		console.log('  VERDICT: No overlapping data to compare');
	} else if (matchRate === '100.0') {
		console.log('  VERDICT: ✓ READY FOR CUTOVER — 100% match across all compared days');
	} else if (parseFloat(matchRate) >= 95) {
		console.log(`  VERDICT: ~ MOSTLY READY — ${matchRate}% match. Review mismatches above.`);
	} else {
		console.log(`  VERDICT: ✗ NOT READY — Only ${matchRate}% match. Investigate mismatches.`);
	}
	console.log('='.repeat(70));
	console.log('');

	await sql.end();
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
