#!/usr/bin/env npx tsx
/** Re-test invstock/getall and invstock/list now that NRS fixed the bug. */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;

async function POST(p: string, body: Record<string, unknown>) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60000)
	});
	const t = await r.text();
	return { status: r.status, body: t };
}
async function GET(p: string) {
	const r = await fetch(`https://www.nrsaccounting.com/api/${p}`, {
		headers: { company: API_KEY },
		signal: AbortSignal.timeout(60000)
	});
	const t = await r.text();
	return { status: r.status, body: t };
}

function inspect(label: string, r: { status: number; body: string }) {
	console.log(`${label}: HTTP ${r.status}`);
	if (r.body.startsWith('<')) {
		console.log(`  → HTML/error: ${r.body.slice(0, 200)}`);
		return;
	}
	try {
		const d = JSON.parse(r.body);
		if (d.err) {
			console.log(`  → err ${d.err.num} "${d.err.msg}"`);
			return;
		}
		if (Array.isArray(d.list)) {
			console.log(`  → list[${d.list.length}], nextPage=${d.nextPage ?? 'null'}`);
			if (d.list.length > 0) {
				const sample = d.list[0];
				console.log(`  → first item keys: ${Object.keys(sample).slice(0, 12).join(', ')}`);
				console.log(`  → first item sample: ${JSON.stringify(sample).slice(0, 250)}`);
			}
			return;
		}
		console.log(`  → keys: ${Object.keys(d).slice(0, 10).join(', ')}`);
		console.log(`  → ${JSON.stringify(d).slice(0, 250)}`);
	} catch {
		console.log(`  → ${r.body.slice(0, 200)}`);
	}
}

async function main() {
	console.log('Re-testing invstock/getall + invstock/list after NRS bug fix\n');

	console.log('── invstock/getall ──');
	inspect('POST {} (empty)', await POST('invstock/getall', {}));
	inspect('POST {storeId:20}', await POST('invstock/getall', { storeId: 20 }));
	inspect('POST {pagesize:5}', await POST('invstock/getall', { pagesize: 5 }));
	inspect('POST {pagesize:5,page:1}', await POST('invstock/getall', { pagesize: 5, page: 1 }));

	console.log('\n── invstock/list ──');
	inspect('GET (no params)', await GET('invstock/list'));
	inspect('GET ?storeId=20', await GET('invstock/list?storeId=20'));
	inspect('POST {} (try POST)', await POST('invstock/list', {}));
}

main().catch((e) => { console.error(e); process.exit(1); });
