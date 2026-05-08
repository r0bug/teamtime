#!/usr/bin/env npx tsx
/**
 * NRS Inventory API Probe
 *
 * Tries common endpoint patterns to discover what we can read about a
 * vendor's inventory (parts/items). For each endpoint we try GET and POST,
 * with and without vendor filtering, and report what comes back.
 *
 * Usage:
 *   npx tsx scripts/nrs-probe-inventory.ts                       # use first vendor with sales
 *   npx tsx scripts/nrs-probe-inventory.ts --vendor 4            # specific NRS vendor id
 */

import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

if (!API_KEY) {
	console.error('NRS_API_KEY not set');
	process.exit(1);
}

const vendorArgIdx = process.argv.indexOf('--vendor');
const argVendorId = vendorArgIdx >= 0 ? parseInt(process.argv[vendorArgIdx + 1], 10) : null;

interface ProbeResult {
	method: 'GET' | 'POST';
	endpoint: string;
	body?: Record<string, unknown>;
	status: number;
	httpOk: boolean;
	hasErr?: { num: number; msg: string };
	listLength?: number;
	firstKeys?: string[];
	sample?: Record<string, unknown>;
	rawSnippet?: string;
}

async function probe(opts: {
	method: 'GET' | 'POST';
	endpoint: string;
	body?: Record<string, unknown>;
	query?: Record<string, string | number>;
}): Promise<ProbeResult> {
	let url = `${API_BASE}/${opts.endpoint}`;
	if (opts.query) {
		const qs = new URLSearchParams(
			Object.entries(opts.query).map(([k, v]) => [k, String(v)])
		).toString();
		url += `?${qs}`;
	}

	let resp: Response;
	try {
		resp = await fetch(url, {
			method: opts.method,
			headers: opts.method === 'POST'
				? { 'Content-Type': 'application/json', company: API_KEY! }
				: { company: API_KEY! },
			body: opts.method === 'POST' && opts.body ? JSON.stringify(opts.body) : undefined,
			signal: AbortSignal.timeout(15000)
		});
	} catch (err) {
		return {
			method: opts.method,
			endpoint: opts.endpoint,
			body: opts.body,
			status: 0,
			httpOk: false,
			rawSnippet: `network error: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	const text = await resp.text();
	let data: unknown;
	try { data = JSON.parse(text); }
	catch {
		return {
			method: opts.method, endpoint: opts.endpoint, body: opts.body,
			status: resp.status, httpOk: resp.ok,
			rawSnippet: text.slice(0, 200)
		};
	}

	const result: ProbeResult = {
		method: opts.method,
		endpoint: opts.endpoint,
		body: opts.body,
		status: resp.status,
		httpOk: resp.ok
	};

	if (typeof data === 'object' && data !== null && 'err' in data) {
		const err = (data as { err: { num: number; msg: string } }).err;
		result.hasErr = err;
	}

	if (typeof data === 'object' && data !== null && 'list' in data) {
		const list = (data as { list: unknown[] }).list;
		result.listLength = Array.isArray(list) ? list.length : -1;
		if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'object') {
			result.sample = list[0] as Record<string, unknown>;
			result.firstKeys = Object.keys(list[0] as Record<string, unknown>);
		}
	} else if (typeof data === 'object' && data !== null) {
		// Some endpoints might return the object directly
		result.firstKeys = Object.keys(data).slice(0, 20);
		result.rawSnippet = JSON.stringify(data).slice(0, 200);
	}

	return result;
}

function printResult(r: ProbeResult) {
	const tag = r.method.padEnd(4);
	const ep = r.endpoint.padEnd(35);
	const bodyStr = r.body ? ` ${JSON.stringify(r.body)}` : '';

	let summary = `[${r.status}]`;
	if (r.hasErr) summary += ` err ${r.hasErr.num} "${r.hasErr.msg}"`;
	else if (r.listLength !== undefined) summary += ` list[${r.listLength}]`;
	else if (r.rawSnippet) summary += ` ${r.rawSnippet}`;

	console.log(`  ${tag} ${ep}${bodyStr.padEnd(40)} ${summary}`);

	if (r.firstKeys && !r.hasErr) {
		console.log(`       fields: ${r.firstKeys.slice(0, 12).join(', ')}${r.firstKeys.length > 12 ? '…' : ''}`);
		if (r.sample) {
			const preview: Record<string, unknown> = {};
			for (const k of r.firstKeys.slice(0, 6)) preview[k] = r.sample[k];
			console.log(`       sample: ${JSON.stringify(preview).slice(0, 180)}`);
		}
	}
}

async function pickVendorId(): Promise<number> {
	if (argVendorId) return argVendorId;
	// Pull vendor list, find one that's had recent sales
	const resp = await fetch(`${API_BASE}/vendor/list?storeId=${STORE_ID}`, {
		headers: { company: API_KEY! }
	});
	const data = await resp.json() as { list: { vendorId: number; name: string }[] };
	if (!data.list || data.list.length === 0) throw new Error('No vendors found');
	const first = data.list.find((v) => v.vendorId > 0) ?? data.list[0];
	console.log(`(picked vendor #${first.vendorId} "${first.name}")`);
	return first.vendorId;
}

async function main() {
	console.log('NRS Inventory API Probe');
	console.log(`Store: ${STORE_ID}\n`);

	const vendorId = await pickVendorId();
	console.log(`Probing for vendor inventory using vendorId=${vendorId}\n`);

	console.log('─'.repeat(80));
	console.log('  GET  endpoints (no body)');
	console.log('─'.repeat(80));
	const getEndpoints = [
		'part/list',
		'parts/list',
		'inventory/list',
		'posinventory/list',
		'posinvitem/list',
		'storeitem/list',
		'item/list',
		'sku/list',
		'product/list'
	];
	for (const ep of getEndpoints) {
		const r = await probe({ method: 'GET', endpoint: ep });
		printResult(r);
		// Also try with vendor filter as query
		if (r.httpOk && !r.hasErr) {
			const rv = await probe({ method: 'GET', endpoint: ep, query: { storeId: STORE_ID, vendorId } });
			printResult(rv);
		}
	}

	console.log('\n' + '─'.repeat(80));
	console.log('  POST endpoints (with body)');
	console.log('─'.repeat(80));
	const postEndpoints = [
		'part/getall',
		'parts/getall',
		'inventory/getall',
		'posinventory/getall',
		'posinvitem/getall',
		'storeitem/getall',
		'item/getall',
		'product/getall'
	];
	for (const ep of postEndpoints) {
		// Try with full filter
		const r = await probe({
			method: 'POST',
			endpoint: ep,
			body: { storeId: STORE_ID, vendorId, pagesize: 5, page: 1 }
		});
		printResult(r);
		// If first try erred, try without vendor filter
		if (r.hasErr || r.listLength === undefined) {
			const r2 = await probe({
				method: 'POST',
				endpoint: ep,
				body: { storeId: STORE_ID, pagesize: 5, page: 1 }
			});
			printResult(r2);
		}
	}

	console.log('\n' + '─'.repeat(80));
	console.log('  Single-record probes');
	console.log('─'.repeat(80));
	for (const ep of ['part/get', 'inventory/get', 'posinventory/get', 'item/get']) {
		const r = await probe({ method: 'GET', endpoint: ep, query: { storeId: STORE_ID, partId: 1 } });
		printResult(r);
	}

	console.log('\nDone.');
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
