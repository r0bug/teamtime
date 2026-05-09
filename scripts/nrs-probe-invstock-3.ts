#!/usr/bin/env npx tsx
/** invstock list/getall — try unconventional shapes to unstick the 500. */
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
	const flag = r.status === 200 && !t.startsWith('<!DOCTYPE') ? ' 🎯' : '';
	console.log(`POST ${endpoint} ${JSON.stringify(body)}`);
	console.log(`  → [${r.status}] ${t.slice(0, 250)}${flag}`);
	console.log();
}

async function GET(endpoint: string) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${endpoint}`, {
		headers: { company: API_KEY },
		signal: AbortSignal.timeout(15000)
	});
	const t = await r.text();
	const flag = r.status === 200 && !t.startsWith('<!DOCTYPE') ? ' 🎯' : '';
	console.log(`GET  ${endpoint}`);
	console.log(`  → [${r.status}] ${t.slice(0, 250)}${flag}`);
	console.log();
}

async function main() {
	console.log('═══ Wrapped bodies ═══\n');
	await POST('invstock/getall', { filter: { storeId: STORE_ID } });
	await POST('invstock/getall', { filters: { storeId: STORE_ID } });
	await POST('invstock/getall', { params: { storeId: STORE_ID } });
	await POST('invstock/getall', { query: { storeId: STORE_ID } });
	await POST('invstock/getall', { criteria: { storeId: STORE_ID } });

	console.log('═══ Different param keys ═══\n');
	await POST('invstock/getall', { invStockId: 0 });
	await POST('invstock/getall', { partNumber: 'CAR' });
	await POST('invstock/getall', { active: true });
	await POST('invstock/getall', { isPassThroughItem: true });
	await POST('invstock/getall', { isPassThroughItem: 1 });
	await POST('invstock/getall', { search: '' });
	await POST('invstock/getall', { search: 'CAR' });

	console.log('═══ Use possales-style params ═══\n');
	await POST('invstock/getall', { storeId: STORE_ID, invoiceDate: '2024-01-01', pagesize: 3, page: 1 });
	await POST('invstock/getall', { storeId: STORE_ID, sincedatetime: '2020-01-01 00:00:00', pagesize: 3, page: 1 });

	console.log('═══ Try vendor-prefixed endpoints ═══\n');
	await POST('apvendor/getstockitems', { vendorId: 17358 });
	await POST('apvendor/stockitems', { vendorId: 17358 });
	await POST('vendor/stockitems', { vendorId: 17358 });
	await POST('vendor/getstockitems', { vendorId: 17358 });
	await POST('vendor/getstock', { vendorId: 17358 });

	console.log('═══ Try the report-y endpoints from web UI ═══\n');
	// /ap/apVendorInventoryTotals — the "Vendor inventory sales report"
	await POST('apvendorinventorytotals/getall', { storeId: STORE_ID, vendorId: 17358 });
	await POST('apvendorinventorytotals/get', { vendorId: 17358 });
	await POST('apvendorpayments/getall', { vendorId: 17358 });

	console.log('═══ Try invveninv (vendor part # link) ═══\n');
	await POST('invveninv/getall', { storeId: STORE_ID });
	await POST('invveninv/getall', { apVendorId: 17358 });
	await POST('invveninv/getall', { vendorId: 17358 });
	await POST('invveninv/get', { invVenInvId: 3 });

	console.log('═══ GET vs POST for /list ═══\n');
	// Maybe list takes POST
	await POST('invstock/list', { storeId: STORE_ID });
	await POST('invstock/list', {});
	// Maybe getall takes GET with query
	await GET(`invstock/getall?storeId=${STORE_ID}`);
	await GET(`invstock/getall?passThroughApVendorId=17358`);
}

main().catch((e) => { console.error(e); process.exit(1); });
