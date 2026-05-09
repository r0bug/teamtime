#!/usr/bin/env npx tsx
/** Verify: does our salesTransactions.partId == NRS's invStockId? */
import 'dotenv/config';

const API_KEY = process.env.NRS_API_KEY!;

// PartIds we just pulled from our DB for vendor 17358 (AARON CARTER)
const samples = [
	{ partId: 13065, expectedPartNumber: 'CAR0005', expectedName: 'Toy Car' },
	{ partId: 7385, expectedPartNumber: 'CAR001', expectedName: 'Toy Cars' },
	{ partId: 13066, expectedPartNumber: 'CAR0006', expectedName: 'Toy Car' }
];

async function main() {
	for (const s of samples) {
		const r = await fetch('https://www.nrsaccounting.com/api/invstock/get', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', company: API_KEY },
			body: JSON.stringify({ invStockId: s.partId })
		});
		const d = await r.json() as { get?: { invStockId: number; partNumber: string; name: string; description: string; retailPrice: number; quantityOnHand: number; passThroughVendorName?: string }; err?: { num: number; msg: string } };
		if (d.err) {
			console.log(`partId ${s.partId}: ERR ${d.err.num} "${d.err.msg}"`);
		} else if (d.get) {
			const ok = d.get.partNumber === s.expectedPartNumber;
			console.log(`partId ${s.partId} → invstock/get:`);
			console.log(`  invStockId:  ${d.get.invStockId}    ${d.get.invStockId === s.partId ? '✅ matches' : '❌ MISMATCH'}`);
			console.log(`  partNumber:  ${d.get.partNumber}    (expected ${s.expectedPartNumber}) ${ok ? '✅' : '❌'}`);
			console.log(`  name:        "${d.get.name}"`);
			console.log(`  desc:        "${d.get.description}"`);
			console.log(`  retailPrice: $${d.get.retailPrice}`);
			console.log(`  qtyOnHand:   ${d.get.quantityOnHand}`);
			console.log(`  vendor:      ${d.get.passThroughVendorName ?? '(none)'}`);
		}
		console.log();
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
