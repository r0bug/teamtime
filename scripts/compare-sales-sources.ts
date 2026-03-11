#!/usr/bin/env npx tsx
/**
 * Compare Sales Sources
 *
 * Compares vendor-by-vendor data between 'scraper' and 'nrs_api' sources
 * in the salesSnapshots table for each date.
 *
 * Usage:
 *   npx tsx scripts/compare-sales-sources.ts                    # Last 7 days
 *   npx tsx scripts/compare-sales-sources.ts --days 14          # Last 14 days
 *   npx tsx scripts/compare-sales-sources.ts --date 2026-03-07  # Specific date
 */

import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('ERROR: DATABASE_URL not set in .env');
	process.exit(1);
}

const sql = postgres(DATABASE_URL);

interface VendorData {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

interface Snapshot {
	id: string;
	sale_date: string;
	captured_at: Date;
	total_sales: string;
	total_vendor_amount: string;
	total_retained: string;
	vendor_count: number;
	vendors: VendorData[];
	source: string;
}

// Parse CLI args
const args = process.argv.slice(2);
let days = 7;
let specificDate: string | null = null;

for (let i = 0; i < args.length; i++) {
	if (args[i] === '--days' && args[i + 1]) {
		days = parseInt(args[i + 1]);
		i++;
	} else if (args[i] === '--date' && args[i + 1]) {
		specificDate = args[i + 1];
		i++;
	}
}

async function main() {
	console.log('Sales Source Comparison Report');
	console.log('='.repeat(70));

	let snapshots: Snapshot[];

	if (specificDate) {
		snapshots = await sql<Snapshot[]>`
			SELECT * FROM sales_snapshots
			WHERE sale_date = ${specificDate}
			ORDER BY sale_date, source, captured_at DESC
		`;
	} else {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);
		const startStr = startDate.toISOString().split('T')[0];

		snapshots = await sql<Snapshot[]>`
			SELECT * FROM sales_snapshots
			WHERE sale_date >= ${startStr}
			ORDER BY sale_date, source, captured_at DESC
		`;
	}

	if (snapshots.length === 0) {
		console.log('\nNo snapshots found for the specified period.');
		await sql.end();
		return;
	}

	// Group by date, then by source (take latest snapshot per source per date)
	const byDate = new Map<string, Map<string, Snapshot>>();
	for (const snap of snapshots) {
		const dateKey = snap.sale_date;
		if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
		const sources = byDate.get(dateKey)!;
		// Keep only the latest per source
		if (!sources.has(snap.source)) {
			sources.set(snap.source, snap);
		}
	}

	let totalDates = 0;
	let matchedDates = 0;
	let failedDates = 0;
	const TOLERANCE = 0.02;

	for (const [date, sources] of [...byDate.entries()].sort()) {
		const scraper = sources.get('scraper');
		const api = sources.get('nrs_api');

		console.log(`\n--- ${date} ---`);

		if (!scraper && !api) {
			console.log('  No data from either source');
			continue;
		}

		if (!scraper) {
			console.log('  Scraper: NO DATA');
			console.log(`  API:     $${parseFloat(api!.total_sales).toFixed(2)} sales, ${api!.vendor_count} vendors`);
			continue;
		}

		if (!api) {
			console.log(`  Scraper: $${parseFloat(scraper.total_sales).toFixed(2)} sales, ${scraper.vendor_count} vendors`);
			console.log('  API:     NO DATA');
			continue;
		}

		totalDates++;

		const scraperTotal = parseFloat(scraper.total_sales);
		const apiTotal = parseFloat(api.total_sales);
		const scraperRetained = parseFloat(scraper.total_retained);
		const apiRetained = parseFloat(api.total_retained);
		const scraperVendorAmt = parseFloat(scraper.total_vendor_amount);
		const apiVendorAmt = parseFloat(api.total_vendor_amount);

		const totalDiff = Math.abs(scraperTotal - apiTotal);
		const retainedDiff = Math.abs(scraperRetained - apiRetained);
		const vendorAmtDiff = Math.abs(scraperVendorAmt - apiVendorAmt);

		const totalMatch = totalDiff <= TOLERANCE;
		const retainedMatch = retainedDiff <= TOLERANCE;
		const vendorAmtMatch = vendorAmtDiff <= TOLERANCE;
		const allMatch = totalMatch && retainedMatch && vendorAmtMatch;

		if (allMatch) matchedDates++;
		else failedDates++;

		const status = allMatch ? 'MATCH' : 'MISMATCH';
		console.log(`  Status: ${status}`);
		console.log(`  Total Sales:    Scraper=$${scraperTotal.toFixed(2)}  API=$${apiTotal.toFixed(2)}  Diff=$${totalDiff.toFixed(2)} ${totalMatch ? '✓' : '✗'}`);
		console.log(`  Vendor Amount:  Scraper=$${scraperVendorAmt.toFixed(2)}  API=$${apiVendorAmt.toFixed(2)}  Diff=$${vendorAmtDiff.toFixed(2)} ${vendorAmtMatch ? '✓' : '✗'}`);
		console.log(`  Retained:       Scraper=$${scraperRetained.toFixed(2)}  API=$${apiRetained.toFixed(2)}  Diff=$${retainedDiff.toFixed(2)} ${retainedMatch ? '✓' : '✗'}`);
		console.log(`  Vendor Count:   Scraper=${scraper.vendor_count}  API=${api.vendor_count}`);

		// Per-vendor comparison
		if (!allMatch || scraper.vendor_count !== api.vendor_count) {
			const scraperVendors = new Map(scraper.vendors.map(v => [v.vendor_id, v]));
			const apiVendors = new Map(api.vendors.map(v => [v.vendor_id, v]));
			const allVendorIds = new Set([...scraperVendors.keys(), ...apiVendors.keys()]);

			for (const vid of [...allVendorIds].sort()) {
				const sv = scraperVendors.get(vid);
				const av = apiVendors.get(vid);

				if (!sv) {
					console.log(`    Vendor ${vid}: API only (${av!.vendor_name}) - $${av!.total_sales.toFixed(2)}`);
				} else if (!av) {
					console.log(`    Vendor ${vid}: Scraper only (${sv.vendor_name}) - $${sv.total_sales.toFixed(2)}`);
				} else {
					const salesDiff = Math.abs(sv.total_sales - av.total_sales);
					const retDiff = Math.abs(sv.retained_amount - av.retained_amount);
					if (salesDiff > TOLERANCE || retDiff > TOLERANCE) {
						console.log(`    Vendor ${vid} (${sv.vendor_name}): Sales diff=$${salesDiff.toFixed(2)}, Retained diff=$${retDiff.toFixed(2)}`);
					}
				}
			}
		}
	}

	// Summary
	console.log(`\n${'='.repeat(70)}`);
	console.log('SUMMARY');
	console.log(`  Dates with both sources: ${totalDates}`);
	console.log(`  Matched (<=$${TOLERANCE.toFixed(2)} variance): ${matchedDates}`);
	console.log(`  Mismatched: ${failedDates}`);
	if (totalDates > 0) {
		console.log(`  Match rate: ${((matchedDates / totalDates) * 100).toFixed(1)}%`);
	}
	console.log(`  Tolerance: $${TOLERANCE.toFixed(2)}`);

	if (failedDates === 0 && totalDates >= 5) {
		console.log('\n  ✓ READY FOR CUTOVER - 100% match across 5+ business days');
	} else if (failedDates === 0 && totalDates > 0) {
		console.log(`\n  ~ ON TRACK - ${totalDates} matching days so far (need 5+)`);
	} else if (failedDates > 0) {
		console.log('\n  ✗ NOT READY - Mismatches detected, investigate before cutover');
	}

	console.log('');
	await sql.end();
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
