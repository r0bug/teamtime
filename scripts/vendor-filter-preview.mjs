#!/usr/bin/env node
/** Preview: how many vendors would survive the new filter + cleanup. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(path.dirname(__filename), '..', '.env') });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
	const [{ count: total }] = await sql`SELECT count(*)::int FROM vendors WHERE nrs_vendor_id IS NOT NULL`;
	const [{ count: withPrefix }] = await sql`SELECT count(*)::int FROM vendors WHERE inventory_code_prefix IS NOT NULL`;
	const [{ count: withSales }] = await sql`
		SELECT count(*)::int FROM vendors v
		WHERE v.nrs_vendor_id IS NOT NULL
		  AND EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
	`;
	// Note: this approximates the AND filter against LOCAL data. The real
	// filter is against NRS detail.vendorCode (live), so this is a lower
	// bound — actual results after a fresh sync may add vendors whose
	// vendorCode lives in NRS but isn't reflected as inventoryCodePrefix here yet.
	const [{ count: passingFilter }] = await sql`
		SELECT count(*)::int FROM vendors v
		WHERE v.nrs_vendor_id IS NOT NULL
		  AND v.inventory_code_prefix IS NOT NULL
		  AND EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
	`;
	const [{ count: deletable }] = await sql`
		SELECT count(*)::int FROM vendors v
		WHERE v.status = 'inactive'
		  AND v.user_id IS NULL
		  AND v.portal_enabled = false
		  AND v.inventory_code_prefix IS NULL
		  AND NOT EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
		  AND NOT EXISTS (SELECT 1 FROM vendor_agreements a WHERE a.vendor_id = v.id)
	`;

	console.log('Current TeamTime vendor population:');
	console.log(`  Total NRS-linked:        ${total}`);
	console.log(`  Have inventoryCodePrefix: ${withPrefix}`);
	console.log(`  Have any sales:          ${withSales}`);
	console.log();
	console.log('After applying filter (vendorCode set OR pass-through):');
	console.log(`  Would pass filter:       ${passingFilter}`);
	console.log(`  Would be filtered out:   ${total - passingFilter}`);
	console.log();
	console.log('Cleanup target (safe-to-delete inactive stubs):');
	console.log(`  Would be removed:        ${deletable}`);
	console.log(`  (kept by safety guards: portal/user/prefix/agreements/sales)`);
} finally {
	await sql.end();
}
