#!/usr/bin/env npx tsx
/** Show full vendor/get response for a few real vendors. Read-only. */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);

async function vendorGet(vendorId: number) {
	const r = await fetch('https://www.nrsaccounting.com/api/vendor/get', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', company: API_KEY },
		body: JSON.stringify({ vendorId })
	});
	return r.json();
}

async function main() {
	const list = await fetch(`https://www.nrsaccounting.com/api/vendor/list?storeId=${STORE_ID}`, {
		headers: { company: API_KEY }
	}).then((r) => r.json()) as { list: { vendorId: number; name: string }[] };

	const real = list.list.filter((v) => v.vendorId > 0 && !v.name.includes('***'));
	console.log(`Total real vendors: ${real.length}\n`);

	const samples = real.slice(0, 3);
	for (const v of samples) {
		console.log('═'.repeat(70));
		console.log(`Vendor #${v.vendorId} "${v.name}"`);
		console.log('═'.repeat(70));
		const d = await vendorGet(v.vendorId);
		console.log(JSON.stringify(d, null, 2));
		console.log();
	}

	// Field summary
	const sample = await vendorGet(samples[0].vendorId) as { get?: Record<string, unknown> };
	if (sample.get) {
		console.log('═'.repeat(70));
		console.log('Field summary');
		console.log('═'.repeat(70));
		for (const [k, v] of Object.entries(sample.get)) {
			const typ = v === null ? 'null' : typeof v;
			const preview = String(v).slice(0, 60);
			console.log(`  ${k.padEnd(30)} ${typ.padEnd(8)} ${preview}`);
		}
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
