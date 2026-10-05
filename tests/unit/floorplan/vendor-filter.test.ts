import { describe, it, expect } from 'vitest';
import { isBoothVendor, placeableVendors, matchVendor, vendorHint, type VendorOption } from '$lib/floorplan/vendor-filter';

const v = (o: Partial<VendorOption>): VendorOption => ({
	nrsVendorId: 1, displayName: 'X', vendorPaymentPercent: null, monthlyRentCents: null, placed: false, ...o
});

describe('isBoothVendor', () => {
	it('treats 87/13 vendors and rent payers as booth vendors', () => {
		expect(isBoothVendor(v({ vendorPaymentPercent: 87 }))).toBe(true);
		expect(isBoothVendor(v({ vendorPaymentPercent: 100 }))).toBe(true);
		expect(isBoothVendor(v({ vendorPaymentPercent: 0, monthlyRentCents: 7500 }))).toBe(true);
		expect(isBoothVendor(v({ vendorPaymentPercent: 75, monthlyRentCents: 11837 }))).toBe(true);
	});
	it('excludes 25/75 consignment, 50/50, house 0% and unknown vendors', () => {
		expect(isBoothVendor(v({ vendorPaymentPercent: 75 }))).toBe(false);
		expect(isBoothVendor(v({ vendorPaymentPercent: 50 }))).toBe(false);
		expect(isBoothVendor(v({ vendorPaymentPercent: 0 }))).toBe(false);
		expect(isBoothVendor(v({}))).toBe(false);
	});
});

describe('placeableVendors', () => {
	it('keeps booth vendors and anyone already placed', () => {
		const all = [
			v({ nrsVendorId: 1, vendorPaymentPercent: 87 }),
			v({ nrsVendorId: 2, vendorPaymentPercent: 75 }),
			v({ nrsVendorId: 3, vendorPaymentPercent: 75, placed: true })
		];
		expect(placeableVendors(all).map((x) => x.nrsVendorId)).toEqual([1, 3]);
	});
});

describe('matchVendor / vendorHint', () => {
	it('matches on name or id, case-insensitively', () => {
		const a = v({ nrsVendorId: 17009, displayName: "Storlie's Relics" });
		expect(matchVendor(a, 'storl')).toBe(true);
		expect(matchVendor(a, '1700')).toBe(true);
		expect(matchVendor(a, 'zzz')).toBe(false);
		expect(matchVendor(a, '  ')).toBe(true);
	});
	it('renders rent, percent and placement', () => {
		expect(vendorHint(v({ monthlyRentCents: 17500, vendorPaymentPercent: 87, placed: true }))).toBe('$175/mo · 87% · on floor');
		expect(vendorHint(v({}))).toBe('');
	});
});
