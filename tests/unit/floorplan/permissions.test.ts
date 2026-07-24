import { describe, it, expect } from 'vitest';
import {
	canView,
	canBuild,
	canEditKey,
	viewerRank,
	filterAttrsByRank,
	visibleDefs,
	defsByKey
} from '../../../src/lib/server/floorplan/permissions';
import type { User, FloorplanAttrDef } from '../../../src/lib/server/db/schema';

function user(role: string): User {
	return { id: 'u1', role, isActive: true } as unknown as User;
}

function def(key: string, visibility: string): FloorplanAttrDef {
	return { planId: 'p1', key, type: 'categorical', ownerSystem: 'floorplan', visibility } as FloorplanAttrDef;
}

const DEFS = [def('kind', 'public'), def('vendor_id', 'public'), def('level', 'staff'), def('hunt_2026', 'admin')];
const BY_KEY = defsByKey(DEFS);

describe('role gates', () => {
	it('all staff-side roles can view; null cannot', () => {
		for (const role of ['admin', 'manager', 'purchaser', 'staff']) expect(canView(user(role))).toBe(true);
		expect(canView(null)).toBe(false);
		expect(canView(user('vendor'))).toBe(false);
	});

	it('only admin can build', () => {
		expect(canBuild(user('admin'))).toBe(true);
		expect(canBuild(user('manager'))).toBe(false);
	});

	it('staff can paint operational keys (vendor_id) but not geometry (kind)', () => {
		expect(canEditKey(user('staff'), 'vendor_id', BY_KEY)).toBe(true);
		expect(canEditKey(user('staff'), 'kind', BY_KEY)).toBe(false);
		expect(canEditKey(user('staff'), 'door', BY_KEY)).toBe(false);
	});

	it('undefined keys are Build-only (painting implicitly defines them)', () => {
		expect(canEditKey(user('staff'), 'brand_new_key', BY_KEY)).toBe(false);
		expect(canEditKey(user('admin'), 'brand_new_key', BY_KEY)).toBe(true);
	});
});

describe('visibility filtering (public < staff < admin)', () => {
	const attrs = { kind: 'sellable', vendor_id: '17009', level: 'raised18', hunt_2026: 'pin', mystery: 'x' };

	it('staff rank sees public + staff, not admin or undefined keys', () => {
		expect(filterAttrsByRank(attrs, BY_KEY, viewerRank(user('staff')))).toEqual({
			kind: 'sellable',
			vendor_id: '17009',
			level: 'raised18'
		});
	});

	it('admin rank sees admin keys; undefined keys fail closed to admin', () => {
		expect(filterAttrsByRank(attrs, BY_KEY, viewerRank(user('admin')))).toEqual({
			kind: 'sellable',
			vendor_id: '17009',
			level: 'raised18',
			hunt_2026: 'pin',
			mystery: 'x'
		});
	});

	it('public rank (0) sees only public keys', () => {
		expect(Object.keys(filterAttrsByRank(attrs, BY_KEY, 0)).sort()).toEqual(['kind', 'vendor_id']);
	});

	it('visibleDefs filters the def list the same way', () => {
		expect(visibleDefs(DEFS, 1).map((d) => d.key)).toEqual(['kind', 'vendor_id', 'level']);
	});
});
