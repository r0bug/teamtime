#!/usr/bin/env npx tsx
/** Probe /import/type/ImportInv to see what it accepts. Read-only / no writes. */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const URL = 'https://www.nrsaccounting.com/import/type/ImportInv';

async function GET(opts?: { withAuth?: boolean }) {
	const headers: Record<string, string> = {};
	if (opts?.withAuth) headers.company = API_KEY;
	const r = await fetch(URL, { headers, signal: AbortSignal.timeout(15000) });
	const t = await r.text();
	return { status: r.status, contentType: r.headers.get('content-type'), body: t };
}

async function POST(body: Record<string, unknown> | string, opts?: { withAuth?: boolean; ct?: string }) {
	const headers: Record<string, string> = { 'Content-Type': opts?.ct ?? 'application/json' };
	if (opts?.withAuth) headers.company = API_KEY;
	const r = await fetch(URL, {
		method: 'POST',
		headers,
		body: typeof body === 'string' ? body : JSON.stringify(body),
		signal: AbortSignal.timeout(15000)
	});
	const t = await r.text();
	return { status: r.status, contentType: r.headers.get('content-type'), body: t };
}

function summarize(label: string, r: { status: number; contentType: string | null; body: string }) {
	const isHtml = (r.contentType ?? '').includes('html') || r.body.startsWith('<!DOCTYPE') || r.body.startsWith('<html');
	const isJson = (r.contentType ?? '').includes('json') || r.body.startsWith('{') || r.body.startsWith('[');
	const len = r.body.length;
	console.log(`\n=== ${label} ===`);
	console.log(`  HTTP ${r.status}, content-type: ${r.contentType}, body length: ${len}`);

	if (isJson) {
		try {
			const d = JSON.parse(r.body);
			console.log(`  → JSON keys: ${Object.keys(d).slice(0, 12).join(', ')}`);
			console.log(`  → ${JSON.stringify(d).slice(0, 400)}`);
			return;
		} catch { /* fall through */ }
	}

	if (isHtml) {
		// Extract <title>, any <form action="..."> + input names, any redirect markers
		const title = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
		const forms = [...r.body.matchAll(/<form[^>]*\baction="([^"]*)"[^>]*\bmethod="([^"]*)"/gi)].map((m) => `${m[2].toUpperCase()} ${m[1]}`);
		const inputs = [...r.body.matchAll(/<(?:input|select|textarea)[^>]*\bname="([^"]+)"[^>]*(?:type="([^"]*)")?/gi)].map((m) => `${m[1]}${m[2] ? ` (${m[2]})` : ''}`);
		const refresh = r.body.match(/<meta[^>]*http-equiv="refresh"[^>]*content="(\d+;)?[^"]*url=([^"'>]+)/i)?.[2];
		const isLogin = /\b(login|sign in|password|username)\b/i.test(r.body);
		console.log(`  → HTML page${title ? ` "${title}"` : ''}`);
		if (refresh) console.log(`  → meta refresh → ${refresh}`);
		if (isLogin) console.log(`  → looks like a LOGIN PAGE (auth required)`);
		if (forms.length) console.log(`  → ${forms.length} form(s): ${forms.slice(0, 5).join(' | ')}`);
		if (inputs.length) console.log(`  → ${inputs.length} input(s): ${inputs.slice(0, 30).join(', ')}${inputs.length > 30 ? '…' : ''}`);
		// Look for upload-y hints
		const uploadHints = r.body.match(/multipart\/form-data|enctype|file upload|\.csv|\.xlsx/gi);
		if (uploadHints) console.log(`  → upload hints: ${[...new Set(uploadHints.map((s) => s.toLowerCase()))].join(', ')}`);
		// Sniff any `<script>` JSON config
		const apiHints = [...r.body.matchAll(/['"](\/api\/[a-zA-Z\/\-_]+)['"]/g)].map((m) => m[1]);
		if (apiHints.length) console.log(`  → /api/* refs in HTML: ${[...new Set(apiHints)].slice(0, 10).join(', ')}`);
		return;
	}

	console.log(`  → first 300 chars: ${r.body.slice(0, 300)}`);
}

async function main() {
	console.log(`Probing: ${URL}`);

	summarize('GET (no auth)', await GET());
	summarize('GET (with company header)', await GET({ withAuth: true }));
	summarize('POST {} (no auth)', await POST({}));
	summarize('POST {} (with company header)', await POST({}, { withAuth: true }));
	summarize('POST empty body, x-www-form-urlencoded (with auth)', await POST('', { withAuth: true, ct: 'application/x-www-form-urlencoded' }));

	// Try a sibling discovery
	console.log('\n=== Sibling URL probes ===');
	for (const path of [
		'/import/type',
		'/import',
		'/import/type/Import',
		'/import/type/list',
		'/api/import/type/ImportInv',
		'/api/import/list',
		'/api/import/get',
		'/api/import'
	]) {
		const fullUrl = `https://www.nrsaccounting.com${path}`;
		try {
			const r = await fetch(fullUrl, { headers: { company: API_KEY } });
			const t = await r.text();
			const isHtml = t.startsWith('<!DOCTYPE') || t.startsWith('<html');
			let label;
			if (isHtml) label = '[HTML]';
			else { try { const d = JSON.parse(t); label = `[JSON] keys: ${Object.keys(d).slice(0, 6).join(', ')}`; } catch { label = `[${r.status}] ${t.slice(0, 100)}`; } }
			console.log(`  GET ${path}: HTTP ${r.status} — ${label}`);
		} catch (e) {
			console.log(`  GET ${path}: error — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
