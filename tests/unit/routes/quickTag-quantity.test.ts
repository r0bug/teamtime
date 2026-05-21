import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSubmitChange, mockGenerate, mockGetVendor } = vi.hoisted(() => ({
	mockSubmitChange: vi.fn(),
	mockGenerate: vi.fn(),
	mockGetVendor: vi.fn()
}));

vi.mock('$lib/server/services/inventory-change-service', () => ({
	submitChange: mockSubmitChange,
	InventoryChangeError: class extends Error {}
}));
vi.mock('$lib/server/services/vendor-service', () => ({
	getVendorForUser: mockGetVendor,
	generatePartNumber: mockGenerate,
	VendorServiceError: class extends Error {}
}));

import { actions } from '../../../src/routes/(app)/vendor/inventory/+page.server';

function makeRequest(form: Record<string, string>) {
	const fd = new FormData();
	Object.entries(form).forEach(([k, v]) => fd.append(k, v));
	return { formData: async () => fd } as unknown as Request;
}

describe('quickTag action — quantity', () => {
	beforeEach(() => {
		mockSubmitChange.mockReset();
		mockGenerate.mockReset().mockResolvedValue('SR51626001');
		mockGetVendor.mockReset().mockResolvedValue({ id: 'v1', inventoryCodePrefix: 'SR' });
	});

	it('parses quantity and includes it in the payload', async () => {
		const event: any = {
			locals: { user: { id: 'u1' } },
			request: makeRequest({ description: 'Pyrex bowl', priceDollars: '24.99', quantity: '3' })
		};
		await (actions as any).quickTag(event);
		expect(mockSubmitChange).toHaveBeenCalledTimes(1);
		expect(mockSubmitChange.mock.calls[0][0].payload).toMatchObject({
			partName: 'Pyrex bowl', description: 'Pyrex bowl', priceCents: 2499, quantity: 3
		});
	});

	it('omits quantity from payload when field not provided', async () => {
		const event: any = {
			locals: { user: { id: 'u1' } },
			request: makeRequest({ description: 'Pyrex bowl', priceDollars: '24.99' })
		};
		await (actions as any).quickTag(event);
		expect(mockSubmitChange.mock.calls[0][0].payload).not.toHaveProperty('quantity');
	});

	it('omits quantity from payload when blank string passed', async () => {
		const event: any = {
			locals: { user: { id: 'u1' } },
			request: makeRequest({ description: 'X', priceDollars: '1.00', quantity: '' })
		};
		await (actions as any).quickTag(event);
		expect(mockSubmitChange.mock.calls[0][0].payload).not.toHaveProperty('quantity');
	});
});
