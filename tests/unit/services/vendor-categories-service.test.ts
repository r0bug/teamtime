import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getInvCategories } = vi.hoisted(() => ({ getInvCategories: vi.fn() }));
vi.mock('$lib/server/services/nrs-api-client', () => ({ getInvCategories }));

import {
	listVendorCategories,
	_resetCategoryCacheForTest
} from '$lib/server/services/vendor-categories-service';

beforeEach(() => {
	_resetCategoryCacheForTest();
	getInvCategories.mockReset();
});

describe('listVendorCategories', () => {
	it('maps to {id,name}, sorts by name, drops blanks', async () => {
		getInvCategories.mockResolvedValue([
			{ invCategoryId: 2, code: 'B', description: 'Books' },
			{ invCategoryId: 1, code: 'A', description: 'Antiques' },
			{ invCategoryId: 3, code: 'C', description: '' }
		]);
		const r = await listVendorCategories(1000);
		expect(r).toEqual([
			{ id: 1, name: 'Antiques' },
			{ id: 2, name: 'Books' }
		]);
	});

	it('caches within the TTL (no second NRS call)', async () => {
		getInvCategories.mockResolvedValue([{ invCategoryId: 1, code: 'A', description: 'Antiques' }]);
		await listVendorCategories(1000);
		await listVendorCategories(1000 + 60_000);
		expect(getInvCategories).toHaveBeenCalledTimes(1);
	});

	it('serves the stale cache if a refresh fails', async () => {
		getInvCategories.mockResolvedValueOnce([{ invCategoryId: 1, code: 'A', description: 'Antiques' }]);
		await listVendorCategories(0);
		getInvCategories.mockRejectedValueOnce(new Error('nrs down'));
		const r = await listVendorCategories(10 * 60 * 60 * 1000); // past TTL → refresh fails → stale
		expect(r).toEqual([{ id: 1, name: 'Antiques' }]);
	});
});
