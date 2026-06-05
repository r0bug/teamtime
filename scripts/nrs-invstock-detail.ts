#!/usr/bin/env npx tsx
/**
 * Follow-up: confirm invstock/getall response shape + pagination, check whether
 * list filtering actually narrows results, and pull the official API docs page
 * (/support/api) using the web-scrape session cookie.
 * READ-ONLY.
 */
import 'dotenv/config';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const API_BASE = 'https://www.nrsaccounting.com/api';
const BASE_URL = 'https://www.nrsaccounting.com';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

async function POST(p: string, body: Record<string, unknown>) {
	const r = await fetch(`${API_BASE}/${p}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20000)
	});
	return JSON.parse(await r.text());
}

async function GET(p: string, q?: Record<string, string | number>) {
	let url = `${API_BASE}/${p}`;
	if (q) url += `?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`;
	const r = await fetch(url, { headers: { company: API_KEY }, signal: AbortSignal.timeout(20000) });
	return JSON.parse(await r.text());
}

function loadCreds() {
	const p = join(process.cwd(), 'scraper-imports', 'nrscreds.secret');
	if (!existsSync(p)) throw new Error('creds not found');
	const line = readFileSync(p, 'utf-8').trim().split('\n')[0];
	const i = line.indexOf(':');
	return { username: line.slice(0, i), password: line.slice(i + 1) };
}

async function login(): Promise<string> {
	const { username, password } = loadCreds();
	const body = new URLSearchParams({ username, password, useCookie: 'useCookie', form: 'loginForm', loginFormSubmit: 'Log In', ReturnTo: '' });
	const resp = await fetch(BASE_URL + '/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TeamTime-NRSSync/1.0' }, body, redirect: 'manual', signal: AbortSignal.timeout(20000) });
	const m = (resp.headers.get('set-cookie') ?? '').match(/NRSSESS=([^;]+)/);
	if (!m) throw new Error('no NRSSESS cookie');
	return `NRSSESS=${m[1]}`;
}

async function main() {
	console.log('── invstock/getall: shape + pagination ──');
	const p1 = await POST('invstock/getall', { storeId: STORE_ID, pagesize: 3, page: 1 });
	console.log('top-level keys:', Object.keys(p1));
	const arr = p1.getall || p1.list || [];
	console.log('nextPage:', p1.nextPage, '| array len:', arr.length);
	console.log('first record full:\n', JSON.stringify(arr[0], null, 2));

	console.log('\n── does list filtering actually narrow? (compare counts) ──');
	const all = await GET('invstock/list');
	const byVendor = await GET('invstock/list', { passThroughVendorId: 17358 });
	const byVendor2 = await GET('invstock/list', { vendorId: 17358 });
	console.log('list (no filter):', all.list?.length);
	console.log('list passThroughVendorId=17358:', byVendor.list?.length);
	console.log('list vendorId=17358:', byVendor2.list?.length);
	// client-side: how many actually belong to that vendor?
	const mine = (all.list || []).filter((r: any) => r.passThroughVendorId === 17358);
	console.log('client-side filtered to passThroughVendorId 17358:', mine.length);
	console.log('sample of that vendor:', JSON.stringify(mine.slice(0, 2), null, 2));

	console.log('\n── fetching /support/api docs with web session ──');
	try {
		const cookie = await login();
		const r = await fetch(BASE_URL + '/support/api', { headers: { Cookie: cookie, 'User-Agent': 'TeamTime-NRSSync/1.0' }, signal: AbortSignal.timeout(20000) });
		const html = await r.text();
		const outPath = join(process.cwd(), 'scripts', 'nrs-api-docs.html');
		writeFileSync(outPath, html);
		console.log(`status ${r.status}, ${html.length} bytes → saved ${outPath}`);
		// crude text extraction preview
		const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
		console.log('\n── docs text preview (first 3000 chars) ──\n');
		console.log(text.slice(0, 3000));
	} catch (e) {
		console.log('docs fetch failed:', e instanceof Error ? e.message : String(e));
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
