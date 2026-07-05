import { describe, it, expect } from 'vitest';
import { hasTechAccess, TECH } from '$lib/server/auth/tech';

const manager = { id: 'u1', role: 'manager', extraRoles: [] } as any;
const staff = { id: 'u2', role: 'staff', extraRoles: [] } as any;
const isManager = (u: any) => u.role === 'manager' || u.role === 'admin';

function locals(user: any, granted: string[] = [], denied: string[] = []): App.Locals {
	return {
		user,
		session: null,
		userPermissions: user
			? {
					userTypeId: 't1',
					userTypeName: 'x',
					basedOnRole: null,
					grantedRoutes: new Set(granted),
					deniedRoutes: new Set(denied),
					grantedActions: new Map(),
					deniedActions: new Map()
				}
			: null
	} as unknown as App.Locals;
}

describe('hasTechAccess', () => {
	it('denies when not signed in', () => {
		expect(hasTechAccess(locals(null), TECH.credentials, isManager)).toBe(false);
	});

	it('falls back to the original role check when no type rules exist (managers unchanged)', () => {
		expect(hasTechAccess(locals(manager), TECH.credentials, isManager)).toBe(true);
		expect(hasTechAccess(locals(staff), TECH.credentials, isManager)).toBe(false);
	});

	it('falls back when userPermissions is null (permission load failure)', () => {
		const l = { user: manager, session: null, userPermissions: null } as unknown as App.Locals;
		expect(hasTechAccess(l, TECH.printers, isManager)).toBe(true);
	});

	it('explicit grant lifts staff past the role check (Tech Support type)', () => {
		expect(hasTechAccess(locals(staff, [TECH.printQueue]), TECH.printQueue, isManager)).toBe(true);
	});

	it('explicit deny blocks a manager (Manager (Retail) type)', () => {
		expect(hasTechAccess(locals(manager, [], [TECH.credentials]), TECH.credentials, isManager)).toBe(false);
	});

	it('deny wins over grant when both exist', () => {
		expect(
			hasTechAccess(locals(manager, [TECH.labelFormats], [TECH.labelFormats]), TECH.labelFormats, isManager)
		).toBe(false);
	});

	it('grant/deny are per-key: a denied key does not affect other keys', () => {
		const l = locals(manager, [], [TECH.credentials]);
		expect(hasTechAccess(l, TECH.credentials, isManager)).toBe(false);
		expect(hasTechAccess(l, TECH.printers, isManager)).toBe(true);
	});

	it('supports permissive fallbacks (vendor-credential gates default to any signed-in user)', () => {
		expect(hasTechAccess(locals(staff), TECH.vendorCredentials, () => true)).toBe(true);
		expect(hasTechAccess(locals(staff, [], [TECH.vendorCredentials]), TECH.vendorCredentials, () => true)).toBe(false);
	});
});
