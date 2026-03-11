#!/usr/bin/env npx tsx
/**
 * NRS API Discovery Script (final)
 *
 * Validated API contract:
 * - Auth: `company` header with API key
 * - Filtering: POST with JSON body (GET params ignored)
 * - Pagination: response = { nextPage: number|null, list: [...] }
 * - Endpoints: posstore/list (GET), vendor/list (GET), possales/getall (POST)
 *
 * Usage:
 *   npx tsx scripts/nrs-api-explore.ts                  # Yesterday
 *   npx tsx scripts/nrs-api-explore.ts --date 2026-03-07
 */

import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

if (!API_KEY) {
	console.error('ERROR: NRS_API_KEY not set in .env');
	process.exit(1);
}

// Parse --date arg
const dateArg = process.argv.find((_, i, a) => a[i - 1] === '--date');
function getTargetDate(): string {
	if (dateArg) return dateArg;
	const d = new Date();
	do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
	return d.toISOString().split('T')[0];
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function apiGet<T>(endpoint: string): Promise<T> {
	const resp = await fetch(`${API_BASE}/${endpoint}`, {
		headers: { company: API_KEY! },
		signal: AbortSignal.timeout(15000)
	});
	const data = await resp.json();
	if (data.err) throw new Error(`${endpoint}: err ${data.err.num} - ${data.err.msg}`);
	return data;
}

async function apiPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
	const resp = await fetch(`${API_BASE}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY! },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30000)
	});
	const data = await resp.json();
	if (data.err && data.err.num !== 203) throw new Error(`${endpoint}: err ${data.err.num} - ${data.err.msg}`);
	return data;
}

async function getAllSales(storeId: number, invoiceDate: string): Promise<unknown[]> {
	const all: unknown[] = [];
	let page = 1;
	while (true) {
		const data = await apiPost<{ list?: unknown[]; nextPage?: number | null }>('possales/getall', {
			storeId, invoiceDate, pagesize: 100, page
		});
		if (!data.list || data.list.length === 0) break;
		all.push(...data.list);
		if (!data.nextPage) break;
		page = data.nextPage;
	}
	return all;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const targetDate = getTargetDate();
	console.log('NRS API Explorer');
	console.log(`API Key:  ${API_KEY!.slice(0, 4)}...${API_KEY!.slice(-4)}`);
	console.log(`Store ID: ${STORE_ID}`);
	console.log(`Date:     ${targetDate}`);

	// 1. Stores
	console.log(`\n${'='.repeat(60)}`);
	console.log('  STORES');
	console.log('='.repeat(60));
	const stores = await apiGet<{ list: { storeId: number; name: string }[] }>('posstore/list');
	for (const s of stores.list) {
		const marker = s.storeId === STORE_ID ? ' ← TARGET' : '';
		console.log(`  #${s.storeId}: ${s.name}${marker}`);
	}

	// 2. Vendors
	console.log(`\n${'='.repeat(60)}`);
	console.log('  VENDORS');
	console.log('='.repeat(60));
	const vendors = await apiGet<{ list: { vendorId: number; name: string }[] }>(`vendor/list?storeId=${STORE_ID}`);
	console.log(`  ${vendors.list.length} vendors found`);
	for (const v of vendors.list.slice(0, 10)) {
		console.log(`    #${v.vendorId}: ${v.name}`);
	}
	if (vendors.list.length > 10) console.log(`    ... and ${vendors.list.length - 10} more`);

	// 3. Sales
	console.log(`\n${'='.repeat(60)}`);
	console.log(`  SALES — ${targetDate}`);
	console.log('='.repeat(60));
	const sales = await getAllSales(STORE_ID, targetDate);
	console.log(`  ${sales.length} line items found`);

	if (sales.length === 0) {
		console.log('  No sales for this date.');
		return;
	}

	// Show schema from first record
	const sample = sales[0] as Record<string, unknown>;
	console.log(`\n  Schema (${Object.keys(sample).length} fields):`);
	for (const [key, val] of Object.entries(sample)) {
		const type = val === null ? 'null' : typeof val;
		const preview = String(val).slice(0, 50);
		console.log(`    ${key.padEnd(30)} ${type.padEnd(8)} ${preview}`);
	}

	// Aggregate by vendor
	type SaleRec = { vendorId: number; vendorName: string | null; totalPrice: number; vendorPortionOfTotalPrice: number; retainedAmountFromVendor: number };
	const vendorTotals = new Map<number, { name: string; sales: number; vendorAmt: number; retained: number; items: number }>();
	for (const record of sales as SaleRec[]) {
		if (!record.vendorId || record.vendorId === 0) continue;
		const existing = vendorTotals.get(record.vendorId);
		if (existing) {
			existing.sales += record.totalPrice || 0;
			existing.vendorAmt += record.vendorPortionOfTotalPrice || 0;
			existing.retained += record.retainedAmountFromVendor || 0;
			existing.items++;
		} else {
			vendorTotals.set(record.vendorId, {
				name: record.vendorName || 'Unknown',
				sales: record.totalPrice || 0,
				vendorAmt: record.vendorPortionOfTotalPrice || 0,
				retained: record.retainedAmountFromVendor || 0,
				items: 1
			});
		}
	}

	console.log(`\n  Vendor Aggregation (${vendorTotals.size} vendors):`);
	console.log(`  ${'ID'.padEnd(8)} ${'Vendor'.padEnd(22)} ${'Items'.padStart(5)} ${'Sales'.padStart(10)} ${'Vendor Amt'.padStart(11)} ${'Retained'.padStart(10)}`);
	console.log(`  ${'-'.repeat(70)}`);

	let totalSales = 0, totalVendorAmt = 0, totalRetained = 0;
	const sorted = [...vendorTotals.entries()].sort((a, b) => b[1].sales - a[1].sales);
	for (const [id, v] of sorted) {
		console.log(`  ${String(id).padEnd(8)} ${v.name.slice(0, 22).padEnd(22)} ${String(v.items).padStart(5)} $${v.sales.toFixed(2).padStart(9)} $${v.vendorAmt.toFixed(2).padStart(10)} $${v.retained.toFixed(2).padStart(9)}`);
		totalSales += v.sales;
		totalVendorAmt += v.vendorAmt;
		totalRetained += v.retained;
	}
	console.log(`  ${'-'.repeat(70)}`);
	console.log(`  ${'TOTAL'.padEnd(8)} ${`${vendorTotals.size} vendors`.padEnd(22)} ${String(sales.length).padStart(5)} $${totalSales.toFixed(2).padStart(9)} $${totalVendorAmt.toFixed(2).padStart(10)} $${totalRetained.toFixed(2).padStart(9)}`);

	// Path assessment
	console.log(`\n${'='.repeat(60)}`);
	console.log('  MIGRATION PATH ASSESSMENT');
	console.log('='.repeat(60));
	const fields = Object.keys(sample);
	const hasVendorId = fields.includes('vendorId');
	const hasCommission = fields.some(f => /commission|payout|split|vendor.*amount|retained/i.test(f));

	console.log(`  vendorId field:     ${hasVendorId ? '✓ YES' : '✗ NO'}`);
	console.log(`  vendorName field:   ${fields.includes('vendorName') ? '✓ YES' : '✗ NO'}`);
	console.log(`  Commission fields:  ${hasCommission ? '✓ YES' : '✗ NO'}`);
	console.log(`  totalPrice field:   ${fields.includes('totalPrice') ? '✓ YES' : '✗ NO'}`);
	console.log('');

	if (hasVendorId && hasCommission) {
		console.log('  → PATH A: Full migration — API has vendor ID + commission data');
	} else if (hasVendorId) {
		console.log('  → PATH B: Partial migration — API has vendor ID + sales totals');
		console.log('    Commission split (vendor_amount / retained_amount) not in API.');
		console.log('    Need commission rates from NRS AP module or config table.');
	} else {
		console.log('  → PATH C: Cannot replace scraper');
	}
	console.log('');
}

main().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
