#!/usr/bin/env node
/** How many pass-through vendors have a valid prefix? */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(path.dirname(__filename), '..', '.env') });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
	const r = await sql`
		SELECT
			v.nrs_vendor_id,
			v.display_name,
			v.inventory_code_prefix,
			v.monthly_rent_cents,
			v.max_discount_percent,
			(SELECT count(*)::int FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id) AS sales_count
		  FROM vendors v
		 WHERE v.nrs_vendor_id IS NOT NULL
		   AND EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
		 ORDER BY sales_count DESC
	`;

	const total = r.length;
	const withPrefix = r.filter((v) => v.inventory_code_prefix).length;
	const withRent = r.filter((v) => v.monthly_rent_cents !== null).length;
	const withDisc = r.filter((v) => v.max_discount_percent !== null).length;

	console.log(`Pass-through vendors (have NRS sales):  ${total}`);
	console.log(`  with inventoryCodePrefix:             ${withPrefix} / ${total}`);
	console.log(`  with monthlyRentCents:                ${withRent} / ${total}`);
	console.log(`  with maxDiscountPercent:              ${withDisc} / ${total}`);
	console.log();

	const missingPrefix = r.filter((v) => !v.inventory_code_prefix);
	if (missingPrefix.length > 0) {
		console.log(`Pass-through vendors missing a prefix (top 10 by sales):`);
		for (const v of missingPrefix.slice(0, 10)) {
			console.log(`  #${v.nrs_vendor_id} "${v.display_name}" — ${v.sales_count} sales lines`);
		}
	} else {
		console.log('All pass-through vendors have a prefix populated. 🎉');
	}
} finally {
	await sql.end();
}
