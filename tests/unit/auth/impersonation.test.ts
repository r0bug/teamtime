import { describe, it, expect } from 'vitest';
import { applyImpersonationClamp, vendorOnlyPermissions } from '$lib/server/auth/impersonation';
import { isAdmin, isManager, isVendor, hasPermission } from '$lib/server/auth/roles';

// Storlie's Relics (SR / NRS 17009) is linked to an admin login, and it passes every
// filter in /api/admin/print-vendors, so it appears in the label app's staff-mode
// dropdown. Before the clamp, any manager could impersonate it and receive a full
// admin session. This fixture is that exact account.
const houseVendorAdmin = {
	id: 'u-john',
	role: 'admin',
	email: 'john@yakimafinds.com',
	isActive: true
} as never;

const ordinaryVendor = {
	id: 'u-wayne',
	role: 'staff',
	email: 'waynt.sim@gmail.com',
	isActive: true
} as never;

describe('applyImpersonationClamp', () => {
	it('leaves a normal session completely untouched', () => {
		const u = applyImpersonationClamp(houseVendorAdmin, ['vendor'], false);
		expect(u.role).toBe('admin');
		expect(u.extraRoles).toEqual(['vendor']);
		expect(isAdmin(u)).toBe(true);
		expect(isManager(u)).toBe(true);
	});

	it('strips admin from an impersonated session', () => {
		const u = applyImpersonationClamp(houseVendorAdmin, ['vendor'], true);
		expect(u.role).toBe('staff');
		expect(isAdmin(u)).toBe(false);
		expect(isManager(u)).toBe(false);
	});

	it('strips manager from an impersonated session', () => {
		// Kristy Turner (KK) carries role='manager' on a Vendor-type account, so the
		// escalation is reachable from a vendor's own login too.
		const kristy = { ...(ordinaryVendor as object), role: 'manager' } as never;
		expect(isManager(applyImpersonationClamp(kristy, [], true))).toBe(false);
	});

	it('keeps vendor access so the label app still works while impersonating', () => {
		// The clamp must not be so aggressive that it breaks the thing it protects.
		const u = applyImpersonationClamp(houseVendorAdmin, [], true);
		expect(isVendor(u)).toBe(true);
		expect(u.extraRoles).toEqual(['vendor']);
	});

	it('does not mutate the user row it was handed', () => {
		applyImpersonationClamp(houseVendorAdmin, ['vendor'], true);
		expect((houseVendorAdmin as { role: string }).role).toBe('admin');
	});
});

describe('vendorOnlyPermissions', () => {
	it('denies /admin even though the underlying user is an admin', () => {
		const u = applyImpersonationClamp(houseVendorAdmin, ['vendor'], true);
		expect(hasPermission(u, vendorOnlyPermissions(), '/admin/users')).toBe(false);
		expect(hasPermission(u, vendorOnlyPermissions(), '/admin')).toBe(false);
	});

	it('denies manager-level routes', () => {
		const u = applyImpersonationClamp(houseVendorAdmin, ['vendor'], true);
		expect(hasPermission(u, vendorOnlyPermissions(), '/reports')).toBe(false);
		expect(hasPermission(u, vendorOnlyPermissions(), '/purchases/approve')).toBe(false);
	});

	it('grants nothing and denies nothing explicitly', () => {
		const p = vendorOnlyPermissions();
		expect(p.grantedRoutes.size).toBe(0);
		expect(p.deniedRoutes.size).toBe(0);
		expect(p.basedOnRole).toBe('staff');
	});

	it('returns a fresh object so one request cannot poison another', () => {
		const a = vendorOnlyPermissions();
		a.grantedRoutes.add('/admin');
		expect(vendorOnlyPermissions().grantedRoutes.size).toBe(0);
	});
});
