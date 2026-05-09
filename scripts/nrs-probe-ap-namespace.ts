#!/usr/bin/env npx tsx
/** Last-ditch probe — try the `ap*` namespace exhaustively. */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const TEST_VENDOR_ID = 17011;

async function tryGet(p: string) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, { headers: { company: API_KEY } });
	const t = await r.text();
	const isHtml = t.startsWith('<!DOCTYPE');
	if (isHtml) return null;
	return { status: r.status, body: t.slice(0, 250) };
}

async function tryPost(p: string, body: Record<string, unknown>) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body)
	});
	const t = await r.text();
	const isHtml = t.startsWith('<!DOCTYPE');
	if (isHtml) return null;
	return { status: r.status, body: t.slice(0, 250) };
}

async function main() {
	const candidates = [
		// AP namespace variations
		'apvendoragreement', 'apvendoragreements',
		'apvendorrate', 'apvendorrates',
		'apvendorconfig', 'apvendorsettings',
		'apvendorbooth', 'apvendorbooths',
		'apvendorrentinfo', 'apvendorrent',
		'apvendorcommissioninfo',
		'apvendorinventorytotals',
		'apinvtotals', 'apinventorytotals',
		// Generic
		'agreement', 'agreements',
		'rate', 'rates',
		'rentinfo', 'rents',
		'commissioninfo', 'commissions',
		'vendorconfig', 'vendorsetting', 'vendorsettings',
		'boothconfig', 'booth',
		// CG / consignment patterns
		'cgvendor', 'cg/vendor',
		// Contract / lease
		'contract', 'lease',
		// Specific business names
		'vendorrentinfo', 'vendorcommissioninfo',
		'rentcommission'
	];
	const subs = ['get', 'list', 'getall'];

	let hits = 0;
	for (const ep of candidates) {
		for (const s of subs) {
			const path = `${ep}/${s}`;
			const get = await tryGet(`${path}?vendorId=${TEST_VENDOR_ID}`);
			if (get) {
				console.log(`GET  ${path}: [${get.status}] ${get.body.slice(0, 120)}`);
				hits++;
			}
			const post = await tryPost(path, { vendorId: TEST_VENDOR_ID });
			if (post) {
				console.log(`POST ${path}: [${post.status}] ${post.body.slice(0, 120)}`);
				hits++;
			}
		}
	}

	console.log(`\nHits (non-404 responses): ${hits}`);

	// Also try without /get/list/getall — maybe a flat endpoint
	console.log('\n── flat endpoints ──');
	for (const ep of ['apvendoragreement', 'agreement', 'rate', 'rents', 'apvendorrate']) {
		const get = await tryGet(`${ep}?vendorId=${TEST_VENDOR_ID}`);
		if (get) console.log(`GET  ${ep}: [${get.status}] ${get.body.slice(0, 120)}`);
		const post = await tryPost(ep, { vendorId: TEST_VENDOR_ID });
		if (post) console.log(`POST ${ep}: [${post.status}] ${post.body.slice(0, 120)}`);
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
