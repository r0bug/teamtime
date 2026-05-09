#!/usr/bin/env node
/** Audit: why are some vendors missing inventoryCodePrefix after sync? */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(path.dirname(__filename), '..', '.env') });

const API_KEY = process.env.NRS_API_KEY;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function getVendor(vendorId) {
	const r = await fetch('https://www.nrsaccounting.com/api/vendor/get', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify({ vendorId })
	});
	const d = await r.json();
	return d.get ?? null;
}

const PREFIX_RE = /^[A-Z0-9]{2,6}$/;

try {
	const totalRow = await sql`SELECT count(*)::int FROM vendors WHERE nrs_vendor_id IS NOT NULL`;
	const total = totalRow[0].count;
	const haveRow = await sql`SELECT count(*)::int FROM vendors WHERE inventory_code_prefix IS NOT NULL`;
	const havePrefix = haveRow[0].count;

	console.log(`Total NRS-linked vendors in TT: ${total}`);
	console.log(`Have inventoryCodePrefix:        ${havePrefix}`);
	console.log(`Missing prefix:                  ${total - havePrefix}`);
	console.log();

	if (total - havePrefix === 0) {
		console.log('All synced vendors have a prefix populated.');
		await sql.end();
		process.exit(0);
	}

	const missing = await sql`
		SELECT id, nrs_vendor_id, display_name, monthly_rent_cents, max_discount_percent
		  FROM vendors
		 WHERE nrs_vendor_id IS NOT NULL AND inventory_code_prefix IS NULL
		 ORDER BY display_name
	`;

	console.log(`Auditing ${missing.length} vendors without prefix (sampling first 15)...\n`);
	let emptyCode = 0;
	let invalidCode = 0;
	let collisions = 0;
	const usedPrefixes = new Set(
		(await sql`SELECT inventory_code_prefix FROM vendors WHERE inventory_code_prefix IS NOT NULL`)
			.map((r) => r.inventory_code_prefix)
	);

	for (const v of missing.slice(0, 15)) {
		const detail = await getVendor(v.nrs_vendor_id);
		if (!detail) {
			console.log(`  #${v.nrs_vendor_id} "${v.display_name}": NRS vendor/get returned no detail`);
			continue;
		}
		const code = detail.vendorCode?.trim() ?? '';
		const upper = code.toUpperCase();
		let reason;
		if (!code) { reason = 'NRS vendorCode is empty'; emptyCode++; }
		else if (!PREFIX_RE.test(upper)) { reason = `NRS vendorCode "${code}" fails regex (need 2-6 [A-Z0-9])`; invalidCode++; }
		else if (usedPrefixes.has(upper)) { reason = `prefix "${upper}" already taken by another vendor`; collisions++; }
		else { reason = `unknown — code "${code}" looks valid?`; }
		console.log(`  #${v.nrs_vendor_id} "${v.display_name}": ${reason}`);
	}

	console.log();
	console.log('Sampled summary:');
	console.log(`  empty NRS vendorCode:    ${emptyCode}`);
	console.log(`  invalid NRS vendorCode:  ${invalidCode}`);
	console.log(`  prefix collisions:       ${collisions}`);

	// Rent + max disc summary
	const rentStats = await sql`
		SELECT
			count(*)::int AS total,
			count(monthly_rent_cents)::int AS with_rent,
			count(max_discount_percent)::int AS with_disc
		  FROM vendors
		 WHERE nrs_vendor_id IS NOT NULL
	`;
	console.log();
	console.log('Rent / Max Discount populated:');
	console.log(`  with monthly_rent_cents:    ${rentStats[0].with_rent} / ${rentStats[0].total}`);
	console.log(`  with max_discount_percent:  ${rentStats[0].with_disc} / ${rentStats[0].total}`);
} finally {
	await sql.end();
}
