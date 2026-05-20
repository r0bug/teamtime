import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../fixtures/api-helpers';

vi.mock('$lib/server/services/label-format-service', () => ({
	listFormatsModifiedSince: vi.fn()
}));

import { GET } from '../../src/routes/api/label-formats/+server';
import { listFormatsModifiedSince } from '$lib/server/services/label-format-service';

describe('GET /api/label-formats', () => {
	beforeEach(() => { (listFormatsModifiedSince as any).mockReset(); });

	it('returns 401 when not signed in', async () => {
		const res = await callHandler(GET as any, { url: 'http://x/api/label-formats' });
		expect(res.status).toBe(401);
	});

	it('returns rows with version > cursor when authed', async () => {
		(listFormatsModifiedSince as any).mockResolvedValue([
			{ id: 'f1', code: 'gk420t_1x1', version: 4 },
			{ id: 'f2', code: 'avery_5160', version: 7 }
		]);
		const res = await callHandlerAs(GET as any, 'staff', {
			url: 'http://x/api/label-formats?modified_since=3'
		});
		expect(res.status).toBe(200);
		const body = res.data as any;
		expect(body.version).toBe(7);
		expect(body.formats).toHaveLength(2);
		expect(listFormatsModifiedSince).toHaveBeenCalledWith(3);
	});

	it('defaults modified_since to 0 when missing', async () => {
		(listFormatsModifiedSince as any).mockResolvedValue([]);
		await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/label-formats' });
		expect(listFormatsModifiedSince).toHaveBeenCalledWith(0);
	});

	it('returns version=0 when no rows yet', async () => {
		(listFormatsModifiedSince as any).mockResolvedValue([]);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/label-formats' });
		const body = res.data as any;
		expect(body.version).toBe(0);
		expect(body.formats).toEqual([]);
	});
});
