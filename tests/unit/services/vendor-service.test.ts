/**
 * Smoke tests for the vendor service module.
 *
 * The service is heavily DB-backed and the existing project has no DB-mock
 * pattern, so deep behavioural tests would require a test postgres + a new
 * mocking strategy. Until that lands, these checks ensure the module loads
 * and exposes its public surface — guarding against accidental import / type
 * regressions that would otherwise only surface at request time.
 */

import { describe, it, expect, vi } from 'vitest';

// vendor-service imports `hashPin` from auth/pin, which uses @node-rs/argon2.
// Vitest's happy-dom env resolves argon2's `browser` entry to a wasm fallback
// that isn't installed, so stub the pin module to keep this smoke test pure.
vi.mock('$lib/server/auth/pin', () => ({
	hashPin: async (s: string) => `hash:${s}`,
	verifyPin: async () => true,
	generatePin: () => '000000',
	generate2FACode: () => '000000',
	validatePinFormat: () => true
}));

describe('vendor-service module', () => {
	it('exports the expected public functions', async () => {
		const mod = await import('$lib/server/services/vendor-service');
		expect(typeof mod.listVendors).toBe('function');
		expect(typeof mod.getVendor).toBe('function');
		expect(typeof mod.getVendorAgreements).toBe('function');
		expect(typeof mod.createVendor).toBe('function');
		expect(typeof mod.updateVendor).toBe('function');
		expect(typeof mod.signAgreement).toBe('function');
		expect(typeof mod.syncFromNrs).toBe('function');
		expect(typeof mod.enablePortal).toBe('function');
		expect(typeof mod.disablePortal).toBe('function');
		expect(typeof mod.resetPortalPassword).toBe('function');
		expect(typeof mod.setInventoryPrefix).toBe('function');
		expect(typeof mod.setVendorGroups).toBe('function');
		expect(typeof mod.markOnboardingComplete).toBe('function');
		expect(typeof mod.getVendorForUser).toBe('function');
	});
});

describe('agreement-template-service module', () => {
	it('exports the expected public functions', async () => {
		const mod = await import('$lib/server/services/agreement-template-service');
		expect(typeof mod.listTemplates).toBe('function');
		expect(typeof mod.getTemplate).toBe('function');
		expect(typeof mod.getActiveTemplateByCode).toBe('function');
		expect(typeof mod.createTemplate).toBe('function');
		expect(typeof mod.updateTemplate).toBe('function');
		expect(typeof mod.archiveTemplate).toBe('function');
	});
});
