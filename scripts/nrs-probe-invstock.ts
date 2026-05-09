#!/usr/bin/env npx tsx
/**
 * NRS API probe — third pass, using internal naming surfaced by the
 * Chrome inspection of the NRS web UI.
 *
 * Key insight: the inventory resource is called "invStock" internally
 * (URL: /inventory/invStockManagement, ID: invStockId). We're trying the
 * /api/* endpoints with that vocabulary plus a few siblings.
 *
 * Test data from inspection: vendor #17358 (AARON CARTER) has 8 items,
 * one of which is invStockId 7350. Read-only.
 */

import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const TEST_VENDOR_ID = 17358; // AARON CARTER, 8 items
const TEST_INV_STOCK_ID = 7350; // one of their items

if (!API_KEY) { console.error('NRS_API_KEY not set'); process.exit(1); }

interface Out {
	tag: string;
	status: number;
	bodyText: string;
	hasErr?: { num: number; msg: string };
	listLength?: number;
	keys?: string[];
	objKeys?: string[];
}

function parseBody(text: string): Partial<Out> {
	try {
		const d = JSON.parse(text) as { err?: { num: number; msg: string }; list?: unknown[]; get?: object };
		const out: Partial<Out> = {};
		if (d.err) out.hasErr = d.err;
		if ('list' in d && Array.isArray(d.list)) {
			out.listLength = d.list.length;
			if (d.list.length > 0 && typeof d.list[0] === 'object' && d.list[0] !== null) {
				out.keys = Object.keys(d.list[0] as object);
			}
		} else if ('get' in d && d.get && typeof d.get === 'object') {
			out.objKeys = Object.keys(d.get);
		} else if (typeof d === 'object' && d !== null) {
			const keys = Object.keys(d).filter((k) => k !== 'err');
			if (keys.length) out.keys = keys.slice(0, 15);
		}
		return out;
	} catch { return {}; }
}

async function tryGet(endpoint: string, query?: Record<string, string | number>): Promise<Out> {
	let url = `${API_BASE}/${endpoint}`;
	if (query) url += `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`;
	try {
		const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(10000) });
		const t = await r.text();
		const isHtml = t.startsWith('<!DOCTYPE');
		return {
			tag: `GET  ${endpoint}${query ? ' ' + JSON.stringify(query) : ''}`,
			status: r.status,
			bodyText: isHtml ? '[404 HTML]' : t.slice(0, 220),
			...parseBody(t)
		};
	} catch (e) {
		return { tag: `GET  ${endpoint}`, status: 0, bodyText: `err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

async function tryPost(endpoint: string, body: Record<string, unknown>): Promise<Out> {
	try {
		const r = await fetch(`${API_BASE}/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', company: API_KEY },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10000)
		});
		const t = await r.text();
		const isHtml = t.startsWith('<!DOCTYPE');
		return {
			tag: `POST ${endpoint} ${JSON.stringify(body)}`,
			status: r.status,
			bodyText: isHtml ? '[404 HTML]' : t.slice(0, 220),
			...parseBody(t)
		};
	} catch (e) {
		return { tag: `POST ${endpoint}`, status: 0, bodyText: `err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

function show(o: Out) {
	let summary: string;
	if (o.bodyText.startsWith('[404')) summary = '[404]';
	else if (o.hasErr) summary = `err ${o.hasErr.num} "${o.hasErr.msg}"`;
	else if (o.listLength !== undefined) summary = `LIST[${o.listLength}]`;
	else if (o.objKeys) summary = `OBJ keys: ${o.objKeys.slice(0, 6).join(', ')}…`;
	else if (o.keys) summary = `keys: ${o.keys.slice(0, 4).join(', ')}`;
	else summary = o.bodyText.slice(0, 60);
	const flag = (o.listLength !== undefined && o.listLength > 0) || o.objKeys ? ' 🎯' : '';
	console.log(`  ${summary.padEnd(45)} ${o.tag}${flag}`);
	if (o.keys && o.listLength && o.listLength > 0) {
		console.log(`        sample fields: ${o.keys.slice(0, 14).join(', ')}`);
	}
	if (o.objKeys) {
		console.log(`        object fields: ${o.objKeys.slice(0, 14).join(', ')}`);
	}
}

async function main() {
	console.log('NRS Probe — third pass (invStock + siblings)\n');
	console.log(`Test vendor: ${TEST_VENDOR_ID} (AARON CARTER)`);
	console.log(`Test invStockId: ${TEST_INV_STOCK_ID}\n`);

	console.log('── invstock variants ──');
	for (const ep of ['invstock/list', 'invStock/list']) {
		show(await tryGet(ep));
		show(await tryGet(ep, { storeId: STORE_ID }));
		show(await tryGet(ep, { passThroughApVendorId: TEST_VENDOR_ID }));
		show(await tryGet(ep, { storeId: STORE_ID, passThroughApVendorId: TEST_VENDOR_ID }));
	}

	for (const ep of ['invstock/getall', 'invStock/getall']) {
		show(await tryPost(ep, { storeId: STORE_ID }));
		show(await tryPost(ep, { storeId: STORE_ID, pagesize: 3, page: 1 }));
		show(await tryPost(ep, { storeId: STORE_ID, passThroughApVendorId: TEST_VENDOR_ID, pagesize: 3, page: 1 }));
		show(await tryPost(ep, { storeId: STORE_ID, isPassThroughItem: 1, passThroughApVendorId: TEST_VENDOR_ID, pagesize: 3, page: 1 }));
	}

	console.log('\n── invstock/get (single record) ──');
	for (const ep of ['invstock/get', 'invStock/get']) {
		show(await tryPost(ep, { invStockId: TEST_INV_STOCK_ID }));
		show(await tryPost(ep, { storeId: STORE_ID, invStockId: TEST_INV_STOCK_ID }));
		show(await tryPost(ep, { id: TEST_INV_STOCK_ID }));
	}

	console.log('\n── alternative resource names ──');
	for (const ep of ['posstoreitem', 'possalesitem', 'invitem', 'stockitem', 'apvendorstockitems', 'invveninv']) {
		for (const sub of ['list', 'getall']) {
			const path = `${ep}/${sub}`;
			if (sub === 'list') {
				show(await tryGet(path, { storeId: STORE_ID }));
			} else {
				show(await tryPost(path, { storeId: STORE_ID, pagesize: 3, page: 1 }));
			}
		}
	}

	console.log('\n── /inventory/* prefix variants (mirroring web UI) ──');
	for (const path of ['inventory/invStockManagement', 'inventory/list', 'inventory/getall']) {
		show(await tryGet(path, { storeId: STORE_ID }));
	}

	console.log('\n── try with no body / minimal body on invstock/getall ──');
	for (const body of [{}, { storeId: STORE_ID }, { companyId: 102 }, { storeId: STORE_ID, companyId: 102 }]) {
		show(await tryPost('invstock/getall', body));
	}

	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
