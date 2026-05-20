import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../../fixtures/api-helpers';

const mockSelect = vi.fn();
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({ limit: () => mockSelect() })
				})
			})
		})
	},
	pendingInventoryChanges: {
		vendorId: 'vendorId', partNumber: 'partNumber',
		submittedAt: 'submittedAt', payload: 'payload', changeType: 'changeType'
	}
}));
vi.mock('$lib/server/services/vendor-service', () => ({ getVendorForUser: vi.fn() }));

import { GET } from '../../../src/routes/api/vendor/items/+server';
import { getVendorForUser } from '$lib/server/services/vendor-service';

describe('GET /api/vendor/items', () => {
	beforeEach(() => { vi.clearAllMocks(); mockSelect.mockReset(); });

	it('401 when not signed in', async () => {
		const res = await callHandler(GET as any, { url: 'http://x/api/vendor/items' });
		expect(res.status).toBe(401);
	});

	it('403 when caller is not a vendor', async () => {
		(getVendorForUser as any).mockResolvedValue(null);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/vendor/items' });
		expect(res.status).toBe(403);
	});

	it('returns rows scoped to the calling vendor only', async () => {
		(getVendorForUser as any).mockResolvedValue({ id: 'v1' });
		mockSelect.mockResolvedValue([
			{ partNumber: 'SR51626001', changeType: 'create', payload: { partName: 'X', priceCents: 100 }, submittedAt: new Date() }
		]);
		const res = await callHandlerAs<{ serverTime: string; items: any[] }>(GET as any, 'staff', { url: 'http://x/api/vendor/items' });
		expect(res.status).toBe(200);
		expect(res.data.items).toHaveLength(1);
		expect(res.data.items[0].partNumber).toBe('SR51626001');
		expect(res.data.serverTime).toBeDefined();
	});

	it('returns 400 on invalid modified_since', async () => {
		(getVendorForUser as any).mockResolvedValue({ id: 'v1' });
		const res = await callHandlerAs(GET as any, 'staff', {
			url: 'http://x/api/vendor/items?modified_since=not-a-date'
		});
		expect(res.status).toBe(400);
	});

	it('honors limit query param', async () => {
		(getVendorForUser as any).mockResolvedValue({ id: 'v1' });
		mockSelect.mockResolvedValue([]);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/vendor/items?limit=50' });
		expect(res.status).toBe(200);
	});

	it('clamps oversized limit', async () => {
		(getVendorForUser as any).mockResolvedValue({ id: 'v1' });
		mockSelect.mockResolvedValue([]);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/vendor/items?limit=99999' });
		expect(res.status).toBe(200);
	});
});
