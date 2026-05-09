#!/usr/bin/env node
/** What's actually populated in the vendors table now? */
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
			count(*)::int AS total,
			count(inventory_code_prefix)::int AS w_prefix,
			count(monthly_rent_cents)::int AS w_rent,
			count(vendor_payment_percent)::int AS w_pay_pct,
			count(max_discount_percent)::int AS w_max_disc,
			count(contact_email)::int AS w_email,
			count(contact_phone)::int AS w_phone,
			count(address_line_1)::int AS w_addr,
			count(notes)::int AS w_notes
		FROM vendors
		WHERE EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = vendors.nrs_vendor_id)
	`;
	console.log('Pass-through vendor coverage:');
	console.log(`  Total pass-through:    ${r[0].total}`);
	console.log(`  inventoryCodePrefix:   ${r[0].w_prefix} / ${r[0].total}`);
	console.log(`  monthly rent:          ${r[0].w_rent} / ${r[0].total}`);
	console.log(`  vendor payment %:      ${r[0].w_pay_pct} / ${r[0].total}`);
	console.log(`  max discount %:        ${r[0].w_max_disc} / ${r[0].total}`);
	console.log(`  contact email:         ${r[0].w_email} / ${r[0].total}`);
	console.log(`  contact phone:         ${r[0].w_phone} / ${r[0].total}`);
	console.log(`  address line 1:        ${r[0].w_addr} / ${r[0].total}`);
	console.log(`  notes:                 ${r[0].w_notes} / ${r[0].total}`);
} finally {
	await sql.end();
}
