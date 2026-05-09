#!/usr/bin/env npx tsx
/**
 * Probe NRS for any structured rent / commission / pass-through-config
 * endpoints. Read-only.
 *
 * Test vendor: 17011 (Amber Alvarez, vendorCode "EMV"). NRS notes say
 * 13% commission, $175 rent — so somewhere there must be structured data
 * the payment-generator reads.
 */

import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const TEST_VENDOR_ID = 17011;

interface Out { path: string; method: string; status: number; body: string; tag?: string }

async function tryGet(endpoint: string, query?: Record<string, string | number>): Promise<Out> {
	let url = `https://www.nrsaccounting.com/api/${endpoint}`;
	if (query) url += `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`;
	try {
		const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(10000) });
		const t = await r.text();
		return { method: 'GET', path: `${endpoint}${query ? ' ' + JSON.stringify(query) : ''}`, status: r.status, body: t.slice(0, 300) };
	} catch (e) {
		return { method: 'GET', path: endpoint, status: 0, body: `err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

async function tryPost(endpoint: string, body: Record<string, unknown>): Promise<Out> {
	try {
		const r = await fetch(`https://www.nrsaccounting.com/api/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', company: API_KEY },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10000)
		});
		const t = await r.text();
		return { method: 'POST', path: `${endpoint} ${JSON.stringify(body)}`, status: r.status, body: t.slice(0, 300) };
	} catch (e) {
		return { method: 'POST', path: endpoint, status: 0, body: `err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

function describe(o: Out): string {
	if (o.body.startsWith('<!DOCTYPE')) return `[404 HTML]`;
	if (o.body.startsWith('<pre>Error')) return `[PHP ERR] ${o.body.slice(5, 200).replace(/\n/g, ' ')}…`;
	try {
		const d = JSON.parse(o.body);
		if (d.err) return `err ${d.err.num} "${d.err.msg}"`;
		if (d.list && Array.isArray(d.list)) return `LIST[${d.list.length}] keys: ${d.list[0] ? Object.keys(d.list[0]).slice(0, 8).join(', ') : '—'}`;
		if (d.get) return `OBJ keys: ${Object.keys(d.get).slice(0, 10).join(', ')}`;
		if (typeof d === 'object') return `obj keys: ${Object.keys(d).slice(0, 10).join(', ')}`;
		return `[${o.status}]`;
	} catch {
		return `[${o.status}] ${o.body.slice(0, 80)}`;
	}
}

function show(o: Out) {
	const desc = describe(o);
	const flag = (desc.includes('OBJ') || desc.includes('LIST[') && !desc.includes('LIST[0]')) ? ' 🎯' : '';
	console.log(`  ${desc.padEnd(55)} ${o.method.padEnd(4)} ${o.path}${flag}`);
}

async function main() {
	console.log('Probing for structured pass-through / rent / commission data\n');

	console.log('── apVendor variants (web UI uses /inventory/apVendor*) ──');
	for (const path of ['apvendor/get', 'apvendor/list', 'apvendor/getall']) {
		show(await tryGet(path, { vendorId: TEST_VENDOR_ID }));
		show(await tryPost(path, { vendorId: TEST_VENDOR_ID }));
	}

	console.log('\n── apvendorpayment / apvendorrent / apvendorcommission ──');
	for (const path of [
		'apvendorpayment/get', 'apvendorpayment/list', 'apvendorpayment/getall',
		'apvendorpayments/get', 'apvendorpayments/list', 'apvendorpayments/getall',
		'apvendorrent/get', 'apvendorrent/list',
		'apvendorcommission/get', 'apvendorcommission/list',
		'vendorpayment/get', 'vendorpayment/list', 'vendorpayment/getall',
		'vendorpayments/getall',
		'vendorrent/get', 'vendorrent/list',
		'vendorcommission/get', 'vendorcommission/list',
	]) {
		show(await tryPost(path, { vendorId: TEST_VENDOR_ID }));
	}

	console.log('\n── pass-through specific ──');
	for (const path of [
		'passthrough/get', 'passthrough/list',
		'passthroughvendor/get', 'passthroughvendor/list',
		'passthroughconfig/get',
		'consignment/get', 'consignment/list',
		'consignmentvendor/get', 'consignmentvendor/list',
		'consignmentconfig/get',
	]) {
		show(await tryPost(path, { vendorId: TEST_VENDOR_ID }));
		show(await tryGet(path, { vendorId: TEST_VENDOR_ID }));
	}

	console.log('\n── extending vendor/get with extra params ──');
	// Maybe vendor/get has hidden options that expand the response
	for (const body of [
		{ vendorId: TEST_VENDOR_ID, includeRent: true },
		{ vendorId: TEST_VENDOR_ID, includeCommission: true },
		{ vendorId: TEST_VENDOR_ID, includeAll: true },
		{ vendorId: TEST_VENDOR_ID, includePassThrough: true },
		{ vendorId: TEST_VENDOR_ID, expand: 'all' },
		{ vendorId: TEST_VENDOR_ID, fields: 'all' },
	]) {
		show(await tryPost('vendor/get', body));
	}

	console.log('\n── what about apgeneratevendorpayments? ──');
	// Web UI: /ap/apGenerateVendorPayments
	for (const path of [
		'apgeneratevendorpayments/get', 'apgeneratevendorpayments/getall', 'apgeneratevendorpayments/list',
		'generatevendorpayments/get', 'generatevendorpayments/list',
		'apvendorpaymentgen/get',
	]) {
		show(await tryPost(path, { vendorId: TEST_VENDOR_ID, storeId: STORE_ID }));
	}

	console.log('\n── apvendorinventorytotals (the report URL we saw) ──');
	for (const body of [
		{ vendorId: TEST_VENDOR_ID, storeId: STORE_ID },
		{ apVendorId: TEST_VENDOR_ID, storeId: STORE_ID }
	]) {
		show(await tryPost('apvendorinventorytotals/get', body));
		show(await tryPost('apvendorinventorytotals/getall', body));
	}

	console.log('\n── invveninv (vendor part # link) revisit with right params ──');
	// frmApVendorId is the field name from the web UI form
	for (const body of [
		{ apVendorId: TEST_VENDOR_ID },
		{ apVendorId: TEST_VENDOR_ID, storeId: STORE_ID },
		{ apVendorId: TEST_VENDOR_ID, pagesize: 5, page: 1 },
	]) {
		show(await tryPost('invveninv/getall', body));
		show(await tryPost('invveninv/list', body));
	}

	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
