#!/usr/bin/env npx tsx
/** Drill on vendor/get and vendor/* paths. Read-only. */

import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

async function tryGet(endpoint: string, query?: Record<string, string | number>) {
	let url = `${API_BASE}/${endpoint}`;
	if (query) url += `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`;
	const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(10000) });
	const t = await r.text();
	const isHtml = t.startsWith('<!DOCTYPE');
	let parsed: unknown = null;
	try { parsed = JSON.parse(t); } catch { /* ignore */ }
	const tag = `GET  ${endpoint}${query ? ' ?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString() : ''}`;
	const summary = isHtml
		? `[${r.status}] HTML (404 page)`
		: `[${r.status}] ${JSON.stringify(parsed).slice(0, 220)}`;
	console.log(`  ${tag}`);
	console.log(`     → ${summary}`);
}

async function tryPost(endpoint: string, body: Record<string, unknown>) {
	const r = await fetch(`${API_BASE}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10000)
	});
	const t = await r.text();
	const isHtml = t.startsWith('<!DOCTYPE');
	let parsed: unknown = null;
	try { parsed = JSON.parse(t); } catch { /* ignore */ }
	const summary = isHtml ? `[${r.status}] HTML` : `[${r.status}] ${JSON.stringify(parsed).slice(0, 220)}`;
	console.log(`  POST ${endpoint} ${JSON.stringify(body)}`);
	console.log(`     → ${summary}`);
}

async function pickVendorId(): Promise<number> {
	const r = await fetch(`${API_BASE}/vendor/list?storeId=${STORE_ID}`, { headers: { company: API_KEY } });
	const d = await r.json() as { list: { vendorId: number; name: string }[] };
	// Find a real vendor (not "*** Not-on-File ***")
	const real = d.list.find((v) => v.vendorId > 0 && !v.name.includes('***'));
	console.log(`Picked vendor: #${real?.vendorId} "${real?.name}"`);
	return real?.vendorId ?? d.list[0].vendorId;
}

async function main() {
	const vId = await pickVendorId();
	console.log();

	console.log('── vendor/get with various param shapes ──');
	await tryGet('vendor/get');
	await tryGet('vendor/get', { storeId: STORE_ID });
	await tryGet('vendor/get', { vendorId: vId });
	await tryGet('vendor/get', { storeId: STORE_ID, vendorId: vId });
	await tryGet('vendor/get', { id: vId });
	await tryPost('vendor/get', { storeId: STORE_ID, vendorId: vId });
	await tryPost('vendor/get', { vendorId: vId });
	await tryPost('vendor/get', { id: vId });

	console.log('\n── vendor/* path probing ──');
	for (const sub of ['list', 'get', 'getall', 'find', 'search', 'detail', 'info', 'data', 'count']) {
		await tryGet(`vendor/${sub}`, { storeId: STORE_ID, vendorId: vId });
	}

	console.log('\n── vendor + items: try POST too ──');
	for (const ep of ['vendor/items', 'vendor/parts', 'vendor/inventory', 'vendor/listparts', 'vendor/listitems']) {
		await tryPost(ep, { storeId: STORE_ID, vendorId: vId, pagesize: 3, page: 1 });
	}

	console.log('\n── compare with known-good ──');
	await tryGet('vendor/list', { storeId: STORE_ID });
	await tryPost('possales/getall', { storeId: STORE_ID, pagesize: 1, page: 1 });

	console.log('\n── try err 100/err 201 with random nonsense paths ──');
	// Validate whether err 100 is "endpoint exists" or "fall-through default"
	await tryGet('vendor/totallymadeup');
	await tryGet('vendor/asdfqwer');
	await tryGet('vendor/zzzzzzzz');
	await tryGet('possales/totallymadeup');
	await tryGet('store/totallymadeup');
}

main().catch((e) => { console.error(e); process.exit(1); });
