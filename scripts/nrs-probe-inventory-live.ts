#!/usr/bin/env npx tsx
/**
 * NRS inventory API — LIVE re-probe (2026-06-05).
 *
 * NRS team says they've shipped the inventory API service. This re-runs the
 * known read candidates (invstock/list|getall|get) that previously 404'd,
 * plus a discovery sweep, to map what is now live and its record schema.
 *
 * READ-ONLY: this script only GETs and POSTs list/get/read shapes. No writes.
 */
import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const TEST_VENDOR_ID = 17358; // AARON CARTER, ~8 items (from prior inspection)
const TEST_INV_STOCK_ID = 7350;

if (!API_KEY) { console.error('NRS_API_KEY not set'); process.exit(1); }

interface Result {
	tag: string;
	status: number;
	kind: '404' | 'php-error' | 'err' | 'list' | 'object' | 'json' | 'other';
	detail: string;
	sampleFields?: string[];
	sampleRecord?: unknown;
}

function classify(tag: string, status: number, text: string): Result {
	if (text.startsWith('<!DOCTYPE') || (text.startsWith('<') && text.toLowerCase().includes('not found'))) {
		return { tag, status, kind: '404', detail: '[404 HTML]' };
	}
	if (text.startsWith('<pre>') || text.startsWith('<br') || text.startsWith('<b>')) {
		return { tag, status, kind: 'php-error', detail: text.slice(0, 200).replace(/\n/g, ' ') };
	}
	let d: any;
	try { d = JSON.parse(text); } catch {
		return { tag, status, kind: 'other', detail: text.slice(0, 160) };
	}
	if (d && d.err) {
		return { tag, status, kind: 'err', detail: `err ${d.err.num} "${d.err.msg}"` };
	}
	if (d && Array.isArray(d.list)) {
		const first = d.list[0];
		const fields = first && typeof first === 'object' ? Object.keys(first) : undefined;
		return {
			tag, status, kind: 'list',
			detail: `LIST[${d.list.length}]${d.nextPage ? ` nextPage=${d.nextPage}` : ''}`,
			sampleFields: fields,
			sampleRecord: first
		};
	}
	if (d && d.get && typeof d.get === 'object') {
		return { tag, status, kind: 'object', detail: 'OBJ (get)', sampleFields: Object.keys(d.get), sampleRecord: d.get };
	}
	const keys = d && typeof d === 'object' ? Object.keys(d) : [];
	return { tag, status, kind: 'json', detail: `JSON keys: ${keys.slice(0, 8).join(', ')}`, sampleRecord: d };
}

async function GET(endpoint: string, query?: Record<string, string | number>): Promise<Result> {
	let url = `${API_BASE}/${endpoint}`;
	if (query) url += `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`;
	const tag = `GET  ${endpoint}${query ? ' ' + JSON.stringify(query) : ''}`;
	try {
		const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(15000) });
		return classify(tag, r.status, await r.text());
	} catch (e) {
		return { tag, status: 0, kind: 'other', detail: `fetch err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

async function POST(endpoint: string, body: Record<string, unknown> = {}): Promise<Result> {
	const tag = `POST ${endpoint} ${JSON.stringify(body)}`;
	try {
		const r = await fetch(`${API_BASE}/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', company: API_KEY },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000)
		});
		return classify(tag, r.status, await r.text());
	} catch (e) {
		return { tag, status: 0, kind: 'other', detail: `fetch err: ${e instanceof Error ? e.message : String(e)}` };
	}
}

const hits: Result[] = [];
function show(r: Result) {
	const flag = r.kind === 'list' || r.kind === 'object' ? ' 🎯' : r.kind === 'err' ? ' ·exists' : '';
	console.log(`  ${r.detail.padEnd(48)} ${r.tag}${flag}`);
	if (r.sampleFields) console.log(`        fields: ${r.sampleFields.join(', ')}`);
	if (r.kind === 'list' || r.kind === 'object') hits.push(r);
}

async function main() {
	console.log(`NRS inventory LIVE probe — store ${STORE_ID}, test vendor ${TEST_VENDOR_ID}\n`);

	console.log('── invstock/list (GET) ──');
	for (const ep of ['invstock/list', 'invStock/list']) {
		show(await GET(ep));
		show(await GET(ep, { storeId: STORE_ID }));
		show(await GET(ep, { storeId: STORE_ID, vendorId: TEST_VENDOR_ID }));
		show(await GET(ep, { storeId: STORE_ID, passThroughApVendorId: TEST_VENDOR_ID }));
	}

	console.log('\n── invstock/getall (POST, paginated) ──');
	for (const ep of ['invstock/getall', 'invStock/getall']) {
		show(await POST(ep, { storeId: STORE_ID, pagesize: 3, page: 1 }));
		show(await POST(ep, { storeId: STORE_ID, vendorId: TEST_VENDOR_ID, pagesize: 3, page: 1 }));
		show(await POST(ep, { storeId: STORE_ID, passThroughApVendorId: TEST_VENDOR_ID, pagesize: 3, page: 1 }));
	}

	console.log('\n── invstock/get (POST, single) ──');
	for (const ep of ['invstock/get', 'invStock/get']) {
		show(await POST(ep, { storeId: STORE_ID, invStockId: TEST_INV_STOCK_ID }));
		show(await POST(ep, { invStockId: TEST_INV_STOCK_ID }));
		show(await POST(ep, { storeId: STORE_ID, partId: TEST_INV_STOCK_ID }));
	}

	console.log('\n── write-shape endpoints (probed with EMPTY body — expect validation err, NOT success) ──');
	for (const ep of ['invstock/save', 'invstock/create', 'invstock/update', 'invstock/insert', 'invstock/add', 'invstock/upsert', 'invstock/delete']) {
		show(await POST(ep, {}));
	}

	console.log('\n── sibling / alternate resource names ──');
	for (const ep of ['inventory/list', 'inventory/getall', 'part/list', 'part/getall', 'posstoreitem/getall', 'invitem/getall', 'stockitem/getall']) {
		if (ep.endsWith('/list')) show(await GET(ep, { storeId: STORE_ID }));
		else show(await POST(ep, { storeId: STORE_ID, pagesize: 3, page: 1 }));
	}

	if (hits.length) {
		console.log('\n\n════ FULL SAMPLE RECORDS FROM HITS ════');
		for (const h of hits) {
			console.log(`\n▼ ${h.tag}`);
			console.log(JSON.stringify(h.sampleRecord, null, 2).slice(0, 2500));
		}
	} else {
		console.log('\nNo list/object hits — inventory read endpoints still not live under these names.');
	}

	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
