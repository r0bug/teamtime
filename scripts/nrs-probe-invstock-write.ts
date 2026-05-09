#!/usr/bin/env npx tsx
/**
 * Probe NRS for invstock WRITE endpoints.
 * SAFETY: every probe sends an INVALID body (empty / missing required fields)
 * so the endpoint either 404s or returns a validation err. Nothing gets
 * created or modified.
 *
 * The signal we're looking for:
 *   - 404 / HTML        → endpoint doesn't exist
 *   - err 100/201/203/etc → endpoint exists, complains about input
 *   - 200 with success    → endpoint exists; we DID NOT want this with empty body
 */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;

async function POST(p: string, body: Record<string, unknown> = {}) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15000)
	});
	const t = await r.text();
	return { status: r.status, body: t };
}

function inspect(label: string, r: { status: number; body: string }) {
	const isHtml = r.body.startsWith('<');
	if (isHtml && r.body.includes('<!DOCTYPE')) {
		console.log(`  ${label.padEnd(45)} → [404 HTML]`);
		return;
	}
	if (isHtml && r.body.startsWith('<pre>')) {
		console.log(`  ${label.padEnd(45)} → [PHP error] ${r.body.slice(5, 150).replace(/\n/g, ' ')}`);
		return;
	}
	try {
		const d = JSON.parse(r.body);
		if (d.err) {
			console.log(`  ${label.padEnd(45)} → 🎯 EXISTS — err ${d.err.num} "${d.err.msg}"`);
			return;
		}
		// No err and not HTML — could be success (we did NOT want this for empty bodies)
		console.log(`  ${label.padEnd(45)} → ⚠️  HTTP ${r.status}, no err. Keys: ${Object.keys(d).slice(0, 6).join(', ')}`);
		console.log(`     ${JSON.stringify(d).slice(0, 200)}`);
	} catch {
		console.log(`  ${label.padEnd(45)} → [${r.status}] ${r.body.slice(0, 120)}`);
	}
}

async function main() {
	console.log('Probing for invstock write endpoints (SAFE — empty/invalid bodies only)\n');

	const candidates = [
		'invstock/save',
		'invstock/create',
		'invstock/insert',
		'invstock/add',
		'invstock/update',
		'invstock/upsert',
		'invstock/post',
		'invstock/edit',
		'invstock/new',
		'invstock/delete',
		'invstock/remove'
	];

	for (const ep of candidates) {
		inspect(ep, await POST(ep, {}));
	}

	console.log('\n── try with a minimal partNumber (still invalid — missing other required fields) ──');
	for (const ep of ['invstock/save', 'invstock/create', 'invstock/insert', 'invstock/add']) {
		inspect(ep, await POST(ep, { partNumber: '___PROBE___NO_NOT_CREATE___' }));
	}

	console.log('\n── compare with vendor/save (if exists, follows same pattern) ──');
	for (const ep of ['vendor/save', 'vendor/create', 'vendor/update']) {
		inspect(ep, await POST(ep, {}));
	}

	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
