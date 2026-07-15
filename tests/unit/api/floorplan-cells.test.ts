import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../../fixtures/api-helpers';

vi.mock('$lib/server/floorplan/core', () => ({
	getPlan: vi.fn(),
	getAttrDefs: vi.fn(),
	queryCells: vi.fn(),
	applyOps: vi.fn(),
	recomputeCountCache: vi.fn()
}));

// The cells route reads the vendors mirror + current kinds through db.
const dbRows: { vendors: unknown[]; kinds: unknown[] } = { vendors: [], kinds: [] };
vi.mock('$lib/server/db', () => {
	const chain = (rows: () => unknown[]) => {
		const q: Record<string, unknown> = {};
		for (const m of ['select', 'from', 'where', 'groupBy', 'having', 'orderBy', 'limit']) {
			q[m] = vi.fn(() => q);
		}
		(q as { then: unknown }).then = (res: (v: unknown) => void) => Promise.resolve(rows()).then(res);
		return q;
	};
	let call = 0;
	return {
		db: {
			select: vi.fn(() => {
				// first select in a request = vendors lookup, second = kind rows
				const mine = call++ % 2 === 0 ? () => dbRows.vendors : () => dbRows.kinds;
				return chain(mine);
			})
		},
		vendors: { nrsVendorId: 'nrs_vendor_id' },
		floorplanCellAttrs: { planId: 'plan_id', x: 'x', y: 'y', key: 'key', value: 'value' }
	};
});

import { GET, POST } from '../../../src/routes/api/floorplan/[planId]/cells/+server';
import { getPlan, getAttrDefs, queryCells, applyOps, recomputeCountCache } from '$lib/server/floorplan/core';

const PLAN = { id: 'p1', name: 'Yakima Finds', gridW: 140, gridH: 100 };
const DEFS = [
	{ planId: 'p1', key: 'kind', type: 'enum', ownerSystem: 'floorplan', visibility: 'public', renderHint: null },
	{ planId: 'p1', key: 'vendor_id', type: 'categorical', ownerSystem: 'floorplan', visibility: 'public', renderHint: null },
	{ planId: 'p1', key: 'level', type: 'enum', ownerSystem: 'floorplan', visibility: 'staff', renderHint: null },
	{ planId: 'p1', key: 'secret', type: 'enum', ownerSystem: 'teamtime', visibility: 'admin', renderHint: null }
];

// Routes throw SvelteKit HttpError for 401/403/404 — normalize to a status.
async function status(fn: () => Promise<{ status: number }>): Promise<number> {
	try {
		return (await fn()).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	dbRows.vendors = [];
	dbRows.kinds = [];
	(getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(PLAN);
	(getAttrDefs as ReturnType<typeof vi.fn>).mockResolvedValue(DEFS);
	(applyOps as ReturnType<typeof vi.fn>).mockImplementation(async (_p: string, ops: { key: string }[]) => new Set(ops.map((o) => o.key)));
});

describe('GET /api/floorplan/:planId/cells', () => {
	it('401 when not signed in', async () => {
		expect(await status(() => callHandler(GET as never, { params: { planId: 'p1' } }))).toBe(401);
	});

	it('404 when plan missing', async () => {
		(getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		expect(await status(() => callHandlerAs(GET as never, 'staff', { params: { planId: 'nope' } }))).toBe(404);
	});

	it('role-filters attrs: staff never sees admin-visibility keys', async () => {
		(queryCells as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ x: 1, y: 1, attrs: { kind: 'sellable', level: 'raised18', secret: 'x' } }
		]);
		const res = await callHandlerAs<{ cells: { attrs: Record<string, string> }[] }>(GET as never, 'staff', {
			params: { planId: 'p1' }
		});
		expect(res.status).toBe(200);
		expect(res.data.cells[0].attrs).toEqual({ kind: 'sellable', level: 'raised18' });
	});

	it('403 filtering on a key the viewer cannot see', async () => {
		expect(
			await status(() =>
				callHandlerAs(GET as never, 'staff', {
					params: { planId: 'p1' },
					url: 'http://x/api/floorplan/p1/cells?where=secret:x'
				})
			)
		).toBe(403);
	});
});

describe('POST /api/floorplan/:planId/cells', () => {
	const post = (role: 'admin' | 'staff', ops: unknown) =>
		callHandlerAs<{ error?: string; violations?: string[]; ok?: boolean }>(POST as never, role, {
			method: 'POST',
			params: { planId: 'p1' },
			body: { ops }
		});

	it('403 when staff paints a geometry key', async () => {
		expect(await status(() => post('staff', [{ x: 1, y: 1, key: 'kind', value: 'structure' }]))).toBe(403);
	});

	it('400 on out-of-grid coords', async () => {
		const res = await post('staff', [{ x: 140, y: 0, key: 'vendor_id', value: '1' }]);
		expect(res.status).toBe(400);
	});

	it('400 with named violation on unknown vendor_id', async () => {
		dbRows.vendors = []; // no vendor matches
		const res = await post('staff', [{ x: 1, y: 1, key: 'vendor_id', value: '55555' }]);
		expect(res.status).toBe(400);
		expect(res.data.violations?.[0]).toContain('55555');
		expect(applyOps).not.toHaveBeenCalled();
	});

	it('400 when vendor_id targets a non-sellable cell', async () => {
		dbRows.vendors = [{ nrsVendorId: 17009 }];
		dbRows.kinds = [{ x: 1, y: 1, value: 'structure' }];
		const res = await post('staff', [{ x: 1, y: 1, key: 'vendor_id', value: '17009' }]);
		expect(res.status).toBe(400);
		expect(res.data.violations?.[0]).toContain('sellable');
	});

	it('200 applies the batch and pushes vendor_id counts', async () => {
		dbRows.vendors = [{ nrsVendorId: 17009 }];
		dbRows.kinds = [{ x: 1, y: 1, value: 'sellable' }];
		const res = await post('staff', [{ x: 1, y: 1, key: 'vendor_id', value: '17009' }]);
		expect(res.status).toBe(200);
		expect(applyOps).toHaveBeenCalledOnce();
		expect(recomputeCountCache).toHaveBeenCalledWith('p1', 'vendor_id');
	});

	it('admin may carve kind and assign vendor in one batch (batch kind wins)', async () => {
		dbRows.vendors = [{ nrsVendorId: 17009 }];
		const res = await post('admin', [
			{ x: 2, y: 2, key: 'kind', value: 'sellable' },
			{ x: 2, y: 2, key: 'vendor_id', value: '17009' }
		]);
		expect(res.status).toBe(200);
	});

	it('undefined keys are 403 for staff; no count push happens', async () => {
		// zone has no attr def in DEFS — staff cannot edit undefined keys
		expect(await status(() => post('staff', [{ x: 3, y: 3, key: 'zone', value: 'main' }]))).toBe(403);
		expect(recomputeCountCache).not.toHaveBeenCalled();
	});
});
