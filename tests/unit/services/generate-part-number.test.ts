import { describe, it, expect, vi, beforeEach } from 'vitest';

// vendor-service imports hashPin from auth/pin, which uses @node-rs/argon2.
// Vitest's happy-dom env resolves argon2's `browser` entry to a wasm fallback
// that isn't installed, so stub the pin module to keep this test pure.
vi.mock('$lib/server/auth/pin', () => ({
  hashPin: async (s: string) => `hash:${s}`,
  verifyPin: async () => true,
  generatePin: () => '000000',
  generate2FACode: () => '000000',
  validatePinFormat: () => true
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockSelect() }) }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: () => mockInsert() })
      })
    })
  },
  vendors: {},
  vendorPartnumberSequences: { vendorId: 'vendorId', dateStr: 'dateStr', lastNumber: 'lastNumber' }
}));

import { generatePartNumber } from '$lib/server/services/vendor-service';

describe('generatePartNumber — MDDYY format', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockSelect.mockResolvedValue([{ id: 'v1', inventoryCodePrefix: 'SR' }]);
  });

  it('produces prefix + M + DD + YY + 3-digit serial for May 16, 2026', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 1 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 4, 16, 12, 0, 0)) });
    expect(sku).toBe('SR51626001');
  });

  it('zero-pads day to 2 digits but does not pad month', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 7 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 0, 3, 12, 0, 0)) });
    expect(sku).toBe('SR10326007');
  });

  it('pads serial to 3 digits, not 4', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 42 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 4, 16, 12, 0, 0)) });
    expect(sku).toMatch(/^SR51626\d{3}$/);
    expect(sku).toBe('SR51626042');
  });

  it('throws when vendor has no prefix', async () => {
    mockSelect.mockResolvedValue([{ id: 'v1', inventoryCodePrefix: null }]);
    await expect(generatePartNumber('v1')).rejects.toThrow(/prefix/);
  });
});
