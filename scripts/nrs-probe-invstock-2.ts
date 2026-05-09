#!/usr/bin/env npx tsx
/** Capture full response bodies for invstock list/getall + dump full single-item record. */

import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

async function POST(endpoint: string, body: Record<string, unknown>) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15000)
	});
	const t = await r.text();
	console.log(`POST ${endpoint} ${JSON.stringify(body)}`);
	console.log(`  → [${r.status}] ${t.slice(0, 800)}`);
	console.log();
}

async function GET(endpoint: string) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${endpoint}`, {
		headers: { company: API_KEY },
		signal: AbortSignal.timeout(15000)
	});
	const t = await r.text();
	console.log(`GET  ${endpoint}`);
	console.log(`  → [${r.status}] ${t.slice(0, 800)}`);
	console.log();
}

async function main() {
	console.log('═══ invstock/get full payload ═══\n');
	const r = await fetch('https://www.nrsaccounting.com/api/invstock/get', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify({ invStockId: 7350 })
	});
	const single = await r.json() as { get?: Record<string, unknown> };
	console.log(JSON.stringify(single, null, 2));
	console.log();

	console.log('═══ invstock/list — try every shape ═══\n');
	await GET('invstock/list');
	await GET(`invstock/list?storeId=${STORE_ID}`);
	await GET(`invstock/list?passThroughApVendorId=17358`);
	await GET(`invstock/list?storeId=${STORE_ID}&passThroughApVendorId=17358`);
	await GET(`invstock/list?storeId=${STORE_ID}&isPassThroughItem=1&passThroughApVendorId=17358`);

	console.log('═══ invstock/getall — try every shape ═══\n');
	await POST('invstock/getall', {});
	await POST('invstock/getall', { storeId: STORE_ID });
	await POST('invstock/getall', { storeId: STORE_ID, pagesize: 3, page: 1 });
	await POST('invstock/getall', { storeId: STORE_ID, passThroughApVendorId: 17358 });
	await POST('invstock/getall', { storeId: STORE_ID, passThroughApVendorId: 17358, pagesize: 3, page: 1 });
	await POST('invstock/getall', { storeId: STORE_ID, isPassThroughItem: 1, passThroughApVendorId: 17358, pagesize: 3, page: 1 });
	await POST('invstock/getall', { passThroughApVendorId: 17358 });
	await POST('invstock/getall', { storeId: STORE_ID, active: true });
	await POST('invstock/getall', { storeId: STORE_ID, sincedatetime: '2024-01-01' });

	console.log('═══ Other "get" probes (single-record by ID) ═══\n');
	// We confirmed invstock/get works. What about the vendor-part link?
	await POST('invveninv/get', { invStockId: 7350 });
	await POST('apvendorstockitems/get', { vendorId: 17358 });
}

main().catch((e) => { console.error(e); process.exit(1); });
