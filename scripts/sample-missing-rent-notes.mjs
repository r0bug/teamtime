#!/usr/bin/env node
/** Sample NRS notes for vendors where rent didn't get populated. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(path.dirname(__filename), '..', '.env') });

const API_KEY = process.env.NRS_API_KEY;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
	const rows = await sql`
		SELECT v.nrs_vendor_id, v.display_name
		FROM vendors v
		WHERE v.monthly_rent_cents IS NULL
		  AND EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
		ORDER BY v.display_name
		LIMIT 10
	`;

	for (const r of rows) {
		const resp = await fetch('https://www.nrsaccounting.com/api/vendor/get', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', company: API_KEY },
			body: JSON.stringify({ vendorId: r.nrs_vendor_id })
		});
		const d = await resp.json();
		const notes = d.get?.notes ?? '';
		console.log('═'.repeat(70));
		console.log(`#${r.nrs_vendor_id} "${r.display_name}"`);
		if (!notes.trim()) {
			console.log('  (notes are EMPTY in NRS)');
		} else {
			console.log(notes.split('\n').slice(0, 8).join('\n'));
		}
	}
} finally {
	await sql.end();
}
