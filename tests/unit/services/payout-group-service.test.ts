import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, vendors: {} }));
import { rollupNrsId, groupMemberIds, rollupSnapshotVendors, type PayoutGroupMaps } from '$lib/server/services/payout-group-service';

const maps: PayoutGroupMaps = {
	parentOf: new Map([[17038, 17012], [19999, 20363]]),
	childrenOf: new Map([[17012, [17038]], [20363, [19999]]]),
	childIds: new Set([17038, 19999]),
	names: new Map([
		[17012, { displayName: 'David George', code: 'LCA' }],
		[17038, { displayName: 'David George', code: 'YFLC' }],
		[20363, { displayName: 'julie muir', code: 'G&G' }],
		[19999, { displayName: 'Jacob Castillo', code: 'CAS' }]
	])
};

describe('payout groups', () => {
	it('rolls a child up to its parent and leaves others alone', () => {
		expect(rollupNrsId(maps, 17038)).toBe(17012);
		expect(rollupNrsId(maps, 17012)).toBe(17012);
		expect(rollupNrsId(maps, 17358)).toBe(17358);
		expect(groupMemberIds(maps, 17012)).toEqual([17012, 17038]);
		expect(groupMemberIds(maps, 17358)).toEqual([17358]);
	});

	it('merges a day\'s snapshot rows: amounts add, each keeps its own split, parent name wins', () => {
		const day = [
			{ vendor_id: '17012', vendor_name: 'David George', total_sales: 100, vendor_amount: 87, retained_amount: 13 },
			{ vendor_id: '17038', vendor_name: 'YFLC comics', total_sales: 40, vendor_amount: 30, retained_amount: 10 },
			{ vendor_id: '17358', vendor_name: 'AARON CARTER', total_sales: 50, vendor_amount: 43.5, retained_amount: 6.5 }
		];
		const out = rollupSnapshotVendors(day, maps);
		expect(out).toHaveLength(2);
		const lca = out.find((v) => v.vendor_id === '17012')!;
		expect(lca).toMatchObject({ vendor_name: 'David George', total_sales: 140, vendor_amount: 117, retained_amount: 23 });
		expect(out.find((v) => v.vendor_id === '17038')).toBeUndefined();
	});

	it('creates the parent row when only the child sold that day', () => {
		const out = rollupSnapshotVendors([{ vendor_id: '19999', vendor_name: 'Jacob Castillo', total_sales: 20, vendor_amount: 17.4, retained_amount: 2.6 }], maps);
		expect(out).toEqual([{ vendor_id: '20363', vendor_name: 'julie muir', total_sales: 20, vendor_amount: 17.4, retained_amount: 2.6 }]);
	});

	it('is a no-op without groups', () => {
		const empty: PayoutGroupMaps = { parentOf: new Map(), childrenOf: new Map(), childIds: new Set(), names: new Map() };
		const day = [{ vendor_id: '1', vendor_name: 'x', total_sales: 1, vendor_amount: 1, retained_amount: 0 }];
		expect(rollupSnapshotVendors(day, empty)).toBe(day);
	});
});
