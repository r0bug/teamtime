#!/usr/bin/env npx tsx
/** Verify the new invstock/getall params after NRS added them. */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const TEST_VENDOR_ID = 17358; // AARON CARTER

async function POST(body: Record<string, unknown>) {
	const r = await fetch('https://www.nrsaccounting.com/api/invstock/getall', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60000)
	});
	const t = await r.text();
	return { status: r.status, body: t };
}

function summarize(label: string, body: Record<string, unknown>, r: { status: number; body: string }) {
	console.log(`\n── ${label} ──`);
	console.log(`  body: ${JSON.stringify(body)}`);
	console.log(`  HTTP ${r.status}, ${r.body.length} bytes`);
	if (r.body.startsWith('<')) {
		console.log(`  → HTML/error: ${r.body.slice(0, 200)}`);
		return;
	}
	try {
		const d = JSON.parse(r.body);
		if (d.err) {
			console.log(`  → err ${d.err.num} "${d.err.msg}"`);
			return;
		}
		const list = (d.getall || d.list || []) as Array<Record<string, unknown>>;
		console.log(`  → list[${list.length}], top-level keys: ${Object.keys(d).slice(0, 6).join(', ')}`);
		if (list.length > 0) {
			const first = list[0];
			const keys = Object.keys(first);
			const hasLatestChange = keys.includes('latestChangeDateTime') || keys.some((k) => /latestchange/i.test(k));
			console.log(`  → first item: ${keys.length} fields${hasLatestChange ? ' (✓ latestChangeDateTime present)' : ''}`);
			console.log(`  → keys: ${keys.slice(0, 18).join(', ')}${keys.length > 18 ? '…' : ''}`);
			// Spot-check vendor filtering: any items in result with different vendor?
			const vendorIds = new Set<number>();
			for (const it of list.slice(0, 50)) {
				const v = it.passThroughApVendorId ?? it.passThroughVendorId ?? null;
				if (typeof v === 'number') vendorIds.add(v);
			}
			if (vendorIds.size) console.log(`  → distinct vendor IDs in first 50: ${[...vendorIds].join(', ')}`);
		}
	} catch (e) {
		console.log(`  → parse error: ${e instanceof Error ? e.message : String(e)}`);
	}
}

async function main() {
	console.log('Verifying NRS invstock/getall new parameters\n');

	// 1. Baseline (no params) — should still return everything
	summarize('baseline (no params)', {}, await POST({}));

	// 2. passThroughApVendorId filter — THE biggest one
	summarize(
		'passThroughApVendorId filter',
		{ passThroughApVendorId: TEST_VENDOR_ID },
		await POST({ passThroughApVendorId: TEST_VENDOR_ID })
	);

	// 3. sincedatetime — incremental sync support
	summarize(
		'sincedatetime (last 7 days)',
		{ sincedatetime: '2026-05-01 00:00:00' },
		await POST({ sincedatetime: '2026-05-01 00:00:00' })
	);

	// 4. pagesize + page — pagination
	summarize(
		'pagesize=5, page=1',
		{ pagesize: 5, page: 1 },
		await POST({ pagesize: 5, page: 1 })
	);

	// 5. active filter
	summarize('active=true', { active: true }, await POST({ active: true }));

	// 6. Combined — vendor + page
	summarize(
		'vendor + page combined',
		{ passThroughApVendorId: TEST_VENDOR_ID, pagesize: 5, page: 1 },
		await POST({ passThroughApVendorId: TEST_VENDOR_ID, pagesize: 5, page: 1 })
	);
}

main().catch((e) => { console.error(e); process.exit(1); });
