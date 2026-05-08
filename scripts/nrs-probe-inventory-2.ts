#!/usr/bin/env npx tsx
/** Second pass — alternate naming conventions + a root/help probe. Read-only. */

import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const VENDOR_ID = process.argv.includes('--vendor')
	? parseInt(process.argv[process.argv.indexOf('--vendor') + 1], 10)
	: null;

async function pickVendorId(): Promise<number> {
	if (VENDOR_ID) return VENDOR_ID;
	const r = await fetch(`${API_BASE}/vendor/list?storeId=${STORE_ID}`, { headers: { company: API_KEY } });
	const d = await r.json() as { list: { vendorId: number; name: string }[] };
	return d.list.find((v) => v.vendorId > 0)?.vendorId ?? d.list[0].vendorId;
}

interface Out {
	tag: string;
	status: number;
	bodyText: string;
	hasErr?: { num: number; msg: string };
	listLength?: number;
	keys?: string[];
}

async function tryGet(endpoint: string, query?: Record<string, string | number>): Promise<Out> {
	let url = `${API_BASE}/${endpoint}`;
	if (query) {
		const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
		url += `?${qs}`;
	}
	try {
		const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(10000) });
		const t = await r.text();
		return { tag: `GET  ${endpoint}${query ? ' ' + JSON.stringify(query) : ''}`, status: r.status, bodyText: t.slice(0, 200), ...parseBody(t) };
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
		return { tag: `POST ${endpoint} ${JSON.stringify(body)}`, status: r.status, bodyText: t.slice(0, 200), ...parseBody(t) };
	} catch (e) {
		return { tag: `POST ${endpoint}`, status: 0, bodyText: `err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

function parseBody(text: string): Partial<Out> {
	try {
		const d = JSON.parse(text) as { err?: { num: number; msg: string }; list?: unknown[] };
		const out: Partial<Out> = {};
		if (d.err) out.hasErr = d.err;
		if ('list' in d && Array.isArray(d.list)) {
			out.listLength = d.list.length;
			if (d.list.length > 0 && typeof d.list[0] === 'object' && d.list[0] !== null) {
				out.keys = Object.keys(d.list[0] as object);
			}
		} else if (typeof d === 'object' && d !== null) {
			const keys = Object.keys(d).slice(0, 15);
			if (keys.length) out.keys = keys;
		}
		return out;
	} catch {
		return {};
	}
}

function summary(o: Out): string {
	if (o.status === 0) return o.bodyText;
	if (o.status === 404) return `[404]`;
	if (o.hasErr) return `[${o.status}] err ${o.hasErr.num} "${o.hasErr.msg}"`;
	if (o.listLength !== undefined) return `[${o.status}] list[${o.listLength}]`;
	if (o.keys) return `[${o.status}] obj keys: ${o.keys.slice(0, 8).join(', ')}`;
	return `[${o.status}] ${o.bodyText.slice(0, 80)}`;
}

function show(o: Out) {
	console.log(`  ${summary(o).padEnd(60)} ${o.tag}`);
	if (o.keys && (o.listLength === undefined || o.listLength > 0) && !o.hasErr) {
		console.log(`        fields: ${o.keys.slice(0, 14).join(', ')}`);
	}
}

async function main() {
	console.log('NRS Probe — second pass (alternate naming)\n');
	const vId = await pickVendorId();
	console.log(`Using vendorId=${vId}\n`);

	console.log('── root / help / docs ──');
	for (const ep of ['', 'help', 'docs', 'api', 'endpoints', 'methods']) {
		show(await tryGet(ep));
	}

	console.log('\n── Alternate inventory names (GET) ──');
	const altGet = [
		'posvendoritem/list',
		'posvendoritem/getall',
		'posstockitem/list',
		'posstockitem/getall',
		'vendoritem/list',
		'vendoritems/list',
		'vendor/items',
		'vendor/parts',
		'vendor/inventory',
		'vendor/inv',
		'vendorpart/list',
		'aritem/list',
		'posar/list',
		'merchandise/list',
		'merch/list',
		'invitem/list',
		'invlist',
		'pos/parts',
		'pos/inventory',
		'pos/items',
		'lookup/parts',
		'lookup/items'
	];
	for (const ep of altGet) {
		show(await tryGet(ep, { storeId: STORE_ID, vendorId: vId }));
	}

	console.log('\n── Alternate inventory names (POST) ──');
	const altPost = [
		'posvendoritem/getall',
		'posstockitem/getall',
		'vendoritem/getall',
		'vendoritems/getall',
		'vendorpart/getall',
		'aritem/getall',
		'posar/getall',
		'merchandise/getall',
		'invitem/getall',
		'inv/getall',
		'partsinventory/getall',
		'vendorinventory/getall',
		'vendorinv/getall'
	];
	for (const ep of altPost) {
		show(await tryPost(ep, { storeId: STORE_ID, vendorId: vId, pagesize: 3, page: 1 }));
	}

	console.log('\n── Probing vendor with id-style endpoints ──');
	for (const ep of [`vendor/get`, `vendor/${vId}`, `vendor/${vId}/items`, `vendor/${vId}/inventory`, `vendor/${vId}/parts`]) {
		show(await tryGet(ep, { storeId: STORE_ID }));
	}

	console.log('\n── Try possales-style with itemtype filters ──');
	// Maybe there's a non-sale possales call that returns inventory
	for (const body of [
		{ storeId: STORE_ID, vendorId: vId, pagesize: 3, page: 1, includeInventory: true },
		{ storeId: STORE_ID, vendorId: vId, pagesize: 3, page: 1, type: 'inventory' }
	]) {
		show(await tryPost('possales/getall', body));
	}

	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
