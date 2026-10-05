#!/usr/bin/env npx tsx
/**
 * NRS vendor metadata probe (read-only).
 *
 * NRS added a `metadata/list` endpoint (GET or POST, no params) that returns
 * the custom metadata field definitions, and `vendor/get` now returns those
 * fields inline as `meta<N>` keys. As of 2026-10-05 the definitions are:
 *   meta13  Booth Rent                      (int dollars, 0 = none)
 *   meta72  Booth Details                   (null everywhere so far)
 *   meta73  Booth Size and Location         (null everywhere so far)
 *   meta74  Display in Teamtime Floorplan   (bool)
 *
 * Writes go through `POST vendor/save` → `{ saved: <vendorId> }`. The endpoint
 * blanks any key you omit (a partial body wiped `country`), so always send the
 * full vendor/get record with the metas merged in. null text metas are
 * ignored; '' clears. See saveVendorMeta() in nrs-api-client.ts.
 *
 * Usage: npx tsx scripts/nrs-probe-metadata.ts [--all]
 */
import 'dotenv/config';

const API_BASE = 'https://www.nrsaccounting.com/api';
const API_KEY = process.env.NRS_API_KEY!;
const STORE_ID = parseInt(process.env.NRS_STORE_ID || '20', 10);
const h = { 'Content-Type': 'application/json', company: API_KEY };

async function get<T>(p: string): Promise<T> {
	return (await fetch(`${API_BASE}/${p}`, { headers: h })).json();
}
async function post<T>(p: string, body: unknown): Promise<T> {
	return (await fetch(`${API_BASE}/${p}`, { method: 'POST', headers: h, body: JSON.stringify(body) })).json();
}

async function main() {
	const defs = await get<{ list: { metadataId: string; name: string }[] }>('metadata/list');
	console.log('metadata/list:');
	for (const d of defs.list) console.log(`  ${d.metadataId.padEnd(8)} ${d.name}`);

	const vendors = await get<{ list: { vendorId: number; name: string }[] }>(`vendor/list?storeId=${STORE_ID}`);
	const all = process.argv.includes('--all');
	const sample = all ? vendors.list : vendors.list.filter((v) => !v.name.includes('***')).slice(0, 5);
	console.log(`\nvendor/get meta values (${sample.length} of ${vendors.list.length}):`);
	for (const v of sample) {
		const r = await post<{ get?: Record<string, unknown> }>('vendor/get', { vendorId: v.vendorId });
		const g = r.get ?? {};
		const metas = Object.fromEntries(Object.entries(g).filter(([k]) => k.startsWith('meta')));
		console.log(`  #${v.vendorId} ${String(g.vendorCode ?? '').padEnd(6)} ${v.name.slice(0, 28).padEnd(28)} ${JSON.stringify(metas)}`);
	}
}
main().catch((e) => { console.error(e); process.exit(1); });
