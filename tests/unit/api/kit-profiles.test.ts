import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandler, callHandlerAs } from '../../fixtures/api-helpers';

vi.mock('$lib/server/services/kit-profile-service', () => ({
	getKitProfileForVendor: vi.fn(),
	upsertKitProfile: vi.fn(),
	KitProfileError: class extends Error {}
}));
vi.mock('$lib/server/services/vendor-service', () => ({
	getVendorForUser: vi.fn()
}));

import { GET, POST } from '../../../src/routes/api/kit-profiles/+server';
import { getKitProfileForVendor, upsertKitProfile, KitProfileError } from '$lib/server/services/kit-profile-service';
import { getVendorForUser } from '$lib/server/services/vendor-service';

const asVendor = (id = 'v1') =>
	(getVendorForUser as any).mockResolvedValue({
		id,
		inventoryCodePrefix: 'SR',
		displayName: 'V'
	});

describe('GET /api/kit-profiles', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('401 when not signed in', async () => {
		const res = await callHandler(GET as any, { url: 'http://x/api/kit-profiles' });
		expect(res.status).toBe(401);
	});

	it('403 when caller is not a vendor', async () => {
		(getVendorForUser as any).mockResolvedValue(null);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/kit-profiles' });
		expect(res.status).toBe(403);
	});

	it('404 when no kit profile exists for this vendor', async () => {
		asVendor();
		(getKitProfileForVendor as any).mockResolvedValue(null);
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/kit-profiles' });
		expect(res.status).toBe(404);
	});

	it('200 with profile when present', async () => {
		asVendor();
		(getKitProfileForVendor as any).mockResolvedValue({ id: 'k1', printerModel: 'Zebra GK420t' });
		const res = await callHandlerAs(GET as any, 'staff', { url: 'http://x/api/kit-profiles' });
		expect(res.status).toBe(200);
		expect((res.data as any).id).toBe('k1');
		expect((res.data as any).printerModel).toBe('Zebra GK420t');
	});
});

describe('POST /api/kit-profiles', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('401 when not signed in', async () => {
		const res = await callHandler(POST as any, {
			method: 'POST',
			url: 'http://x/api/kit-profiles',
			body: { printerModel: 'X', printerDpi: 203, labelWidthDots: 1, labelHeightDots: 1, backend: 'linux_usb' }
		});
		expect(res.status).toBe(401);
	});

	it('403 when caller is not a vendor', async () => {
		(getVendorForUser as any).mockResolvedValue(null);
		const res = await callHandlerAs(POST as any, 'staff', {
			method: 'POST',
			url: 'http://x/api/kit-profiles',
			body: { printerModel: 'X', printerDpi: 203, labelWidthDots: 1, labelHeightDots: 1, backend: 'linux_usb' }
		});
		expect(res.status).toBe(403);
	});

	it('upserts with vendorId forced from session', async () => {
		asVendor('caller-vendor');
		(upsertKitProfile as any).mockResolvedValue({ id: 'k1' });
		const res = await callHandlerAs(POST as any, 'staff', {
			method: 'POST',
			url: 'http://x/api/kit-profiles',
			body: {
				vendorId: 'evil-other-vendor',
				printerModel: 'Zebra GK420t',
				printerDpi: 203,
				labelWidthDots: 228,
				labelHeightDots: 203,
				backend: 'linux_usb'
			}
		});
		expect(res.status).toBe(200);
		expect((upsertKitProfile as any).mock.calls[0][0]).toBe('caller-vendor');
	});

	it('400 on KitProfileError', async () => {
		asVendor();
		(upsertKitProfile as any).mockRejectedValue(new KitProfileError('backend must be one of ...'));
		const res = await callHandlerAs(POST as any, 'staff', {
			method: 'POST',
			url: 'http://x/api/kit-profiles',
			body: { printerModel: 'X', printerDpi: 203, labelWidthDots: 1, labelHeightDots: 1, backend: 'magic' }
		});
		expect(res.status).toBe(400);
	});
});
