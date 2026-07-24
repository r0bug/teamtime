import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../../fixtures/api-helpers';

vi.mock('$lib/server/floorplan/core', () => ({
	getPlan: vi.fn(),
	recomputeCountCache: vi.fn()
}));

vi.mock('$lib/server/floorplan/snapshots', () => ({
	listSnapshots: vi.fn(),
	createSnapshot: vi.fn(),
	restoreSnapshot: vi.fn(),
	deleteSnapshot: vi.fn()
}));

import { GET, POST } from '../../../src/routes/api/floorplan/[planId]/snapshots/+server';
import {
	POST as RESTORE,
	DELETE
} from '../../../src/routes/api/floorplan/[planId]/snapshots/[snapshotId]/+server';
import { getPlan, recomputeCountCache } from '$lib/server/floorplan/core';
import {
	listSnapshots,
	createSnapshot,
	restoreSnapshot,
	deleteSnapshot
} from '$lib/server/floorplan/snapshots';

const PLAN = { id: 'p1', name: 'Yakima Finds', gridW: 140, gridH: 100 };
const META = { id: 's1', planId: 'p1', name: 'Baseline', kind: 'manual', attrRows: 42, createdBy: 'u1', createdAt: new Date() };

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
	vi.mocked(getPlan).mockResolvedValue(PLAN as never);
});

describe('GET /api/floorplan/:planId/snapshots', () => {
	it('rejects unauthenticated and non-admin users', async () => {
		expect(await status(() => callHandler(GET as never, { params: { planId: 'p1' } }))).toBe(401);
		expect(await status(() => callHandlerAs(GET as never, 'staff', { params: { planId: 'p1' } }))).toBe(403);
		expect(await status(() => callHandlerAs(GET as never, 'manager', { params: { planId: 'p1' } }))).toBe(403);
	});

	it('404s on unknown plan', async () => {
		vi.mocked(getPlan).mockResolvedValue(undefined as never);
		expect(await status(() => callHandlerAs(GET as never, 'admin', { params: { planId: 'nope' } }))).toBe(404);
	});

	it('lists snapshots for admins', async () => {
		vi.mocked(listSnapshots).mockResolvedValue([META] as never);
		const res = await callHandlerAs<{ snapshots: unknown[] }>(GET as never, 'admin', { params: { planId: 'p1' } });
		expect(res.status).toBe(200);
		expect(res.data.snapshots).toHaveLength(1);
		expect(listSnapshots).toHaveBeenCalledWith('p1');
	});
});

describe('POST /api/floorplan/:planId/snapshots', () => {
	it('rejects a missing or blank name', async () => {
		const res = await callHandlerAs(POST as never, 'admin', {
			method: 'POST',
			params: { planId: 'p1' },
			body: { name: '   ' }
		});
		expect(res.status).toBe(400);
		expect(createSnapshot).not.toHaveBeenCalled();
	});

	it('saves the current layout under a trimmed name', async () => {
		vi.mocked(createSnapshot).mockResolvedValue(META as never);
		const res = await callHandlerAs<{ snapshot: { name: string } }>(POST as never, 'admin', {
			method: 'POST',
			params: { planId: 'p1' },
			body: { name: '  Baseline  ' }
		});
		expect(res.status).toBe(200);
		expect(createSnapshot).toHaveBeenCalledWith('p1', 'Baseline', expect.any(String));
	});

	it('is admin-only', async () => {
		expect(
			await status(() =>
				callHandlerAs(POST as never, 'staff', { method: 'POST', params: { planId: 'p1' }, body: { name: 'x' } })
			)
		).toBe(403);
	});
});

describe('POST /api/floorplan/:planId/snapshots/:snapshotId (restore)', () => {
	const params = { planId: 'p1', snapshotId: 's1' };

	it('404s when the snapshot does not exist on this plan', async () => {
		vi.mocked(restoreSnapshot).mockResolvedValue(null);
		expect(await status(() => callHandlerAs(RESTORE as never, 'admin', { method: 'POST', params }))).toBe(404);
	});

	it('restores and pushes the count cache when vendor_id changed', async () => {
		vi.mocked(restoreSnapshot).mockResolvedValue({
			restored: 42,
			backupId: 'b1',
			changedKeys: new Set(['kind', 'vendor_id'])
		});
		const res = await callHandlerAs<{ ok: boolean; restored: number; backupId: string }>(RESTORE as never, 'admin', {
			method: 'POST',
			params
		});
		expect(res.status).toBe(200);
		expect(res.data).toEqual({ ok: true, restored: 42, backupId: 'b1' });
		expect(recomputeCountCache).toHaveBeenCalledWith('p1', 'vendor_id');
	});

	it('skips the count cache when no subscribed key changed', async () => {
		vi.mocked(restoreSnapshot).mockResolvedValue({ restored: 5, backupId: 'b1', changedKeys: new Set(['kind']) });
		const res = await callHandlerAs(RESTORE as never, 'admin', { method: 'POST', params });
		expect(res.status).toBe(200);
		expect(recomputeCountCache).not.toHaveBeenCalled();
	});

	it('is admin-only', async () => {
		expect(await status(() => callHandlerAs(RESTORE as never, 'manager', { method: 'POST', params }))).toBe(403);
		expect(restoreSnapshot).not.toHaveBeenCalled();
	});
});

describe('DELETE /api/floorplan/:planId/snapshots/:snapshotId', () => {
	const params = { planId: 'p1', snapshotId: 's1' };

	it('deletes an existing snapshot', async () => {
		vi.mocked(deleteSnapshot).mockResolvedValue(true);
		const res = await callHandlerAs(DELETE as never, 'admin', { method: 'DELETE', params });
		expect(res.status).toBe(200);
		expect(deleteSnapshot).toHaveBeenCalledWith('p1', 's1');
	});

	it('404s on an unknown snapshot', async () => {
		vi.mocked(deleteSnapshot).mockResolvedValue(false);
		expect(await status(() => callHandlerAs(DELETE as never, 'admin', { method: 'DELETE', params }))).toBe(404);
	});
});
