import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../../fixtures/api-helpers';

const mockPending = vi.fn();
const mockSettings = vi.fn();

vi.mock('$lib/server/db', () => {
	// Build a chainable query mock that supports both:
	//   .where().orderBy().limit()   — pendingInventoryChanges / salesTransactions
	//   .where().limit()             — vendorTagSettings
	function makeChain(terminal: () => Promise<any[]>) {
		const chain: any = {
			from: () => chain,
			where: () => chain,
			orderBy: () => chain,
			limit: terminal
		};
		return chain;
	}

	let callCount = 0;
	const selectFn = () => {
		callCount++;
		if (callCount === 1) return makeChain(mockPending);
		return makeChain(mockSettings);
	};

	return {
		db: { select: selectFn },
		vendorTagSettings: {},
		pendingInventoryChanges: {},
		salesTransactions: {}
	};
});

vi.mock('$lib/server/services/vendor-service', () => ({ getVendorForUser: vi.fn() }));
vi.mock('$lib/server/services/tag-render-service', () => ({ renderZpl: vi.fn() }));

import { GET } from '../../../src/routes/api/vendor/tag-zpl/+server';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderZpl } from '$lib/server/services/tag-render-service';

describe('GET /api/vendor/tag-zpl?copies=', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(getVendorForUser as any).mockResolvedValue({ id: 'v1', inventoryCodePrefix: 'SR', displayName: 'V' });
		(renderZpl as any).mockResolvedValue('^XA^PQ3^XZ');
		mockPending.mockResolvedValue([{ payload: { partName: 'X', priceCents: 100 } }]);
		mockSettings.mockResolvedValue([{}]);
	});

	it('forwards copies query param to renderZpl', async () => {
		const res = await callHandlerAs(GET as any, 'staff', {
			url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001&copies=3'
		});
		expect(res.status).toBe(200);
		expect((renderZpl as any).mock.calls[0][0].copies).toBe(3);
	});

	it('defaults copies to undefined when query param missing', async () => {
		const res = await callHandlerAs(GET as any, 'staff', {
			url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001'
		});
		expect(res.status).toBe(200);
		expect((renderZpl as any).mock.calls[0][0].copies).toBeUndefined();
	});

	it('400 on non-integer copies', async () => {
		const res = await callHandlerAs(GET as any, 'staff', {
			url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001&copies=abc'
		});
		expect(res.status).toBe(400);
	});
});
