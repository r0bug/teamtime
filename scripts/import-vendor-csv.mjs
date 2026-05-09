#!/usr/bin/env node
/**
 * Import the NRS vendors CSV export into TT.
 * Match by vendorCode (= TT inventoryCodePrefix). For each match,
 * fill blanks: monthlyRentCents, vendorPaymentPercent, inventoryCodePrefix
 * (if missing), contactName/Email/Phone (if missing).
 *
 * Run: node scripts/import-vendor-csv.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const csvPath = path.join(repoRoot, 'scripts', 'nrs-vendors-export.csv');
const raw = readFileSync(csvPath, 'utf8');

// Tiny quote-aware CSV parser (handles `"a, b"` cells, no escaped quotes needed here)
function parseCsv(text) {
	const rows = [];
	let row = [], cell = '', inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') inQuotes = false;
			else cell += c;
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(cell); cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell); cell = '';
			if (row.some((x) => x.length > 0)) rows.push(row);
			row = [];
		} else {
			cell += c;
		}
	}
	if (cell.length || row.length) {
		row.push(cell);
		if (row.some((x) => x.length > 0)) rows.push(row);
	}
	return rows;
}

const all = parseCsv(raw);
const header = all[0];
const dataRows = all.slice(1);
console.log(`Parsed ${dataRows.length} CSV rows.`);
const idx = (name) => header.indexOf(name);
const inactiveCol = idx('Inactive');

// Dedupe by vendorCode (CSV had the data pasted twice)
const byCode = new Map();
for (const r of dataRows) {
	const code = (r[idx('Vendor ID')] ?? '').trim();
	if (!code) continue;
	byCode.set(code.toUpperCase(), r);
}
console.log(`Unique vendor codes: ${byCode.size}`);

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let updated = 0, missed = 0, noChange = 0;
const missedCodes = [];

try {
	for (const [code, row] of byCode.entries()) {
		const paymentPctRaw = (row[idx('Pass-Through Vendor Payment %')] ?? '').replace('%', '').trim();
		const boothRentRaw = (row[idx('Booth Rent')] ?? '').trim();
		const contactRaw = (row[idx('Contact')] ?? '').trim();
		const phoneRaw = (row[idx('Phone')] ?? '').trim();
		const emailRaw = (row[idx('Email')] ?? '').trim();
		const inactiveRaw = inactiveCol >= 0 ? (row[inactiveCol] ?? '').trim().toLowerCase() : '';
		const inactive = ['yes', 'y', 'true', '1', 'inactive'].includes(inactiveRaw);

		const paymentPct = paymentPctRaw && paymentPctRaw !== '---' ? paymentPctRaw : null;
		const rentDollars = boothRentRaw && boothRentRaw !== '---' ? parseFloat(boothRentRaw) : null;
		const rentCents = rentDollars !== null && isFinite(rentDollars) ? Math.round(rentDollars * 100) : null;
		const contact = contactRaw && contactRaw !== '---' ? contactRaw : null;
		const phone = phoneRaw && phoneRaw !== '---' ? phoneRaw : null;
		const email = emailRaw && emailRaw !== '---' && !emailRaw.startsWith('---') ? emailRaw.toLowerCase() : null;

		// Find matching TT vendor by inventoryCodePrefix (case-insensitive)
		const matches = await sql`
			SELECT id, inventory_code_prefix, monthly_rent_cents, vendor_payment_percent,
			       contact_name, contact_email, contact_phone, nrs_inactive
			  FROM vendors
			 WHERE upper(inventory_code_prefix) = ${code}
			 LIMIT 1
		`;
		if (matches.length === 0) {
			missed++;
			missedCodes.push(code);
			continue;
		}
		const v = matches[0];
		const set = {};
		if (rentCents !== null && v.monthly_rent_cents === null) set.monthly_rent_cents = rentCents;
		if (paymentPct !== null && v.vendor_payment_percent === null) set.vendor_payment_percent = paymentPct;
		if (contact && !v.contact_name) set.contact_name = contact;
		if (email && !v.contact_email) set.contact_email = email;
		if (phone && !v.contact_phone) set.contact_phone = phone;
		// Inactive flag is authoritative when column present
		if (inactiveCol >= 0 && v.nrs_inactive !== inactive) set.nrs_inactive = inactive;

		if (Object.keys(set).length === 0) { noChange++; continue; }

		await sql`
			UPDATE vendors SET
				monthly_rent_cents = COALESCE(${set.monthly_rent_cents ?? null}, monthly_rent_cents),
				vendor_payment_percent = COALESCE(${set.vendor_payment_percent ?? null}, vendor_payment_percent),
				contact_name = COALESCE(${set.contact_name ?? null}, contact_name),
				contact_email = COALESCE(${set.contact_email ?? null}, contact_email),
				contact_phone = COALESCE(${set.contact_phone ?? null}, contact_phone),
				nrs_inactive = ${set.nrs_inactive !== undefined ? set.nrs_inactive : v.nrs_inactive},
				updated_at = now()
			 WHERE id = ${v.id}
		`;
		updated++;
	}

	// Delete safely-deletable inactive vendors (no portal, no user, no agreements)
	let inactiveDeleted = 0, inactiveKept = 0;
	if (inactiveCol >= 0) {
		const candidates = await sql`
			SELECT id FROM vendors
			 WHERE nrs_inactive = true
			   AND user_id IS NULL
			   AND portal_enabled = false
			   AND id NOT IN (SELECT vendor_id FROM vendor_agreements)
		`;
		const blocked = await sql`
			SELECT count(*)::int AS c FROM vendors
			 WHERE nrs_inactive = true
			   AND id NOT IN (SELECT id FROM vendors WHERE nrs_inactive = true AND user_id IS NULL AND portal_enabled = false AND id NOT IN (SELECT vendor_id FROM vendor_agreements))
		`;
		if (candidates.length > 0) {
			const ids = candidates.map((r) => r.id);
			await sql`DELETE FROM vendors WHERE id = ANY(${ids})`;
			inactiveDeleted = candidates.length;
		}
		inactiveKept = blocked[0].c;
		console.log(`Inactive cleanup: deleted ${inactiveDeleted}, kept ${inactiveKept}`);
	}

	console.log();
	console.log(`Updated:    ${updated}`);
	console.log(`No changes: ${noChange} (already had values)`);
	console.log(`Missed:     ${missed} (no matching vendor by inventoryCodePrefix)`);
	if (missed > 0) {
		console.log(`  → vendor codes in CSV but not in TT: ${missedCodes.slice(0, 20).join(', ')}${missedCodes.length > 20 ? '…' : ''}`);
	}

	const cov = await sql`
		SELECT
			count(*)::int AS total,
			count(monthly_rent_cents)::int AS w_rent,
			count(vendor_payment_percent)::int AS w_pay
		FROM vendors v
		WHERE v.nrs_vendor_id IS NOT NULL
		  AND EXISTS (SELECT 1 FROM sales_transactions s WHERE s.vendor_id = v.nrs_vendor_id)
	`;
	console.log();
	console.log('Pass-through vendor coverage after import:');
	console.log(`  monthly_rent_cents:     ${cov[0].w_rent} / ${cov[0].total}`);
	console.log(`  vendor_payment_percent: ${cov[0].w_pay} / ${cov[0].total}`);
} finally {
	await sql.end();
}
