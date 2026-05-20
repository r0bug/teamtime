import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectKit = vi.fn();
const mockUpsertKit = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ limit: () => mockSelectKit() }) }) }),
		insert: () => ({
			values: (vals: any) => ({
				onConflictDoUpdate: (cfg: any) => ({
					returning: () => mockUpsertKit({ vals, cfg })
				})
			})
		})
	},
	kitProfiles: { vendorId: 'vendorId', kitId: 'kitId' }
}));

import { getKitProfileForVendor, upsertKitProfile, KitProfileError } from '$lib/server/services/kit-profile-service';

describe('kit-profile-service', () => {
	beforeEach(() => { mockSelectKit.mockReset(); mockUpsertKit.mockReset(); });

	it('getKitProfileForVendor returns null when no row', async () => {
		mockSelectKit.mockResolvedValue([]);
		const result = await getKitProfileForVendor('v1');
		expect(result).toBeNull();
	});

	it('getKitProfileForVendor returns the row when found', async () => {
		mockSelectKit.mockResolvedValue([{ id: 'k1', vendorId: 'v1', printerModel: 'Zebra GK420t' }]);
		const result = await getKitProfileForVendor('v1');
		expect(result?.printerModel).toBe('Zebra GK420t');
	});

	it('upsertKitProfile forces vendorId from arg, not from input (security boundary)', async () => {
		mockUpsertKit.mockResolvedValue([{ id: 'k1', vendorId: 'caller-vendor' }]);
		await upsertKitProfile('caller-vendor', {
			vendorId: 'attacker', // adversarial: caller tries to claim another vendor's kit
			printerModel: 'Zebra GK420t',
			printerDpi: 203,
			labelWidthDots: 228,
			labelHeightDots: 203,
			backend: 'linux_usb'
		} as any);
		expect(mockUpsertKit).toHaveBeenCalled();
		const { vals } = mockUpsertKit.mock.calls[0][0];
		expect(vals.vendorId).toBe('caller-vendor');
	});

	it('upsertKitProfile rejects invalid backend', async () => {
		await expect(upsertKitProfile('v1', {
			printerModel: 'X', printerDpi: 203, labelWidthDots: 100, labelHeightDots: 100,
			backend: 'magic' as any
		})).rejects.toBeInstanceOf(KitProfileError);
	});

	it('upsertKitProfile rejects non-positive dpi', async () => {
		await expect(upsertKitProfile('v1', {
			printerModel: 'X', printerDpi: -1, labelWidthDots: 100, labelHeightDots: 100,
			backend: 'linux_usb'
		})).rejects.toBeInstanceOf(KitProfileError);
	});

	it('upsertKitProfile applies safe defaults for optional enum fields', async () => {
		mockUpsertKit.mockResolvedValue([{ id: 'k1' }]);
		await upsertKitProfile('v1', {
			printerModel: 'Zebra', printerDpi: 203, labelWidthDots: 200, labelHeightDots: 200,
			backend: 'linux_usb'
		});
		const { vals } = mockUpsertKit.mock.calls[0][0];
		expect(vals.ownerType).toBe('vendor_byo');
		expect(vals.commandLang).toBe('zpl2');
		expect(vals.mediaSensor).toBe('gap');
		expect(vals.mediaType).toBe('direct_thermal');
	});
});
