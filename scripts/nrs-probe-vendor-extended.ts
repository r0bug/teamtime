#!/usr/bin/env npx tsx
/**
 * Last attempt to find a vendor endpoint that returns booth rent +
 * vendor payment % + isPassThroughVendor + the other fields the NRS
 * web UI shows for vendor 17011.
 */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const VID = 17011;

async function tryPost(p: string, body: Record<string, unknown>) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body)
	});
	const t = await r.text();
	return { status: r.status, body: t };
}
async function tryGet(p: string) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, { headers: { company: API_KEY } });
	const t = await r.text();
	return { status: r.status, body: t };
}

function inspect(label: string, r: { status: number; body: string }) {
	const isHtml = r.body.startsWith('<!DOCTYPE');
	if (isHtml) { console.log(`  ${label}: [404 HTML]`); return; }
	try {
		const d = JSON.parse(r.body);
		// Look for evidence of expanded fields
		const ours = d.get ? Object.keys(d.get) : Object.keys(d);
		const interesting = ours.filter((k) => /rent|booth|commission|payment|passthrough|inactive|leaddays|portal|customer|contacts|attachments|expense|category|discount/i.test(k));
		const hint = interesting.length > 0 ? ` 🎯 NEW: ${interesting.join(', ')}` : '';
		console.log(`  ${label}: [${r.status}] ${ours.length} fields${hint}`);
		if (interesting.length > 0) console.log(`     ${JSON.stringify(d).slice(0, 400)}`);
	} catch {
		console.log(`  ${label}: [${r.status}] ${r.body.slice(0, 80)}`);
	}
}

async function main() {
	// Baseline
	const base = await tryPost('vendor/get', { vendorId: VID });
	const baseObj = JSON.parse(base.body) as { get?: Record<string, unknown> };
	const baseKeys = baseObj.get ? Object.keys(baseObj.get) : [];
	console.log(`Baseline vendor/get: ${baseKeys.length} fields`);
	console.log(`  ${baseKeys.join(', ')}\n`);

	console.log('── vendor/get with verbose flags ──');
	for (const body of [
		{ vendorId: VID, verbose: true },
		{ vendorId: VID, verbose: 1 },
		{ vendorId: VID, full: true },
		{ vendorId: VID, full: 1 },
		{ vendorId: VID, mode: 'full' },
		{ vendorId: VID, version: 2 },
		{ vendorId: VID, apiVersion: 2 },
		{ vendorId: VID, level: 'detail' },
		{ vendorId: VID, detail: true },
		{ vendorId: VID, includePassThrough: 1 },
		{ vendorId: VID, fields: '*' },
		{ vendorId: VID, includeFields: 'all' }
	]) {
		inspect(`POST vendor/get ${JSON.stringify(body)}`, await tryPost('vendor/get', body));
	}

	console.log('\n── vendor/* sibling endpoints ──');
	for (const path of [
		'vendor/getfull', 'vendor/getall', 'vendor/getdetail', 'vendor/getdetails',
		'vendor/getconfig', 'vendor/getextended', 'vendor/getcomplete',
		'vendor/find', 'vendor/lookup', 'vendor/info',
		'vendorfull/get', 'vendordetail/get', 'vendordetails/get',
		'vendorconfig/get', 'vendorinfo/get', 'vendorextended/get',
		'fullvendor/get', 'fullvendor/getall'
	]) {
		inspect(`POST ${path}`, await tryPost(path, { vendorId: VID }));
	}

	console.log('\n── single-field probes ──');
	// Maybe individual endpoints exist for the missing data
	for (const path of [
		'vendorboothrent/get', 'boothrent/get', 'vendorrent/get',
		'vendorpaymentpercent/get', 'vendorpercent/get',
		'vendorpassthrough/get', 'passthrough/getconfig',
		'vendor1099/get', 'vendorcontacts/get', 'vendorattachments/get'
	]) {
		inspect(`POST ${path}`, await tryPost(path, { vendorId: VID }));
	}

	console.log('\n── Try alternative param keys on vendor/get ──');
	for (const body of [
		{ id: VID },
		{ apVendorId: VID },
		{ vendorid: VID },
		{ VendorId: VID }
	]) {
		inspect(`POST vendor/get ${JSON.stringify(body)}`, await tryPost('vendor/get', body));
	}

	console.log('\n── Try a different base URL form ──');
	inspect('GET vendor/17011', await tryGet(`vendor/${VID}`));
	inspect('GET vendor/17011/full', await tryGet(`vendor/${VID}/full`));
	inspect('GET vendor/17011/detail', await tryGet(`vendor/${VID}/detail`));
}

main().catch((e) => { console.error(e); process.exit(1); });
