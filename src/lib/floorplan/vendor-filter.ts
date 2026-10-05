// Which vendors belong in the floorplan "place a vendor" picker.
//
// Replaces the hand-curated include list (and the NRS "Display in Teamtime
// Floorplan" flag that used to drive it). Rule of thumb from the office:
// booth renters are the 87/13 vendors or anyone paying monthly rent; 25/75
// consignment vendors (and the 50/50, 30/70, house 0% rows) don't get floor
// space, so they stay out of the way unless "show all" is on. Anyone already
// painted or pooled is always listed so existing paint can be re-selected.

export interface VendorOption {
	nrsVendorId: number;
	displayName: string;
	/** % the vendor receives of gross sales (NRS "Vendor Payment %"), or null if unknown. */
	vendorPaymentPercent: number | null;
	monthlyRentCents: number | null;
	/** Painted on any plan or a member of a pool. */
	placed: boolean;
}

/** Payment % at or above this means a booth-rental split (87/13), not consignment (75/25). */
export const BOOTH_PAYMENT_PERCENT_MIN = 80;

export function isBoothVendor(v: Pick<VendorOption, 'vendorPaymentPercent' | 'monthlyRentCents'>): boolean {
	if ((v.monthlyRentCents ?? 0) > 0) return true;
	return v.vendorPaymentPercent !== null && v.vendorPaymentPercent >= BOOTH_PAYMENT_PERCENT_MIN;
}

/** Default picker list: booth vendors plus anyone already on the floor. */
export function placeableVendors<T extends VendorOption>(all: T[]): T[] {
	return all.filter((v) => v.placed || isBoothVendor(v));
}

/** Case-insensitive match on name or NRS id; empty query matches everything. */
export function matchVendor(v: Pick<VendorOption, 'nrsVendorId' | 'displayName'>, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return v.displayName.toLowerCase().includes(q) || String(v.nrsVendorId).includes(q);
}

/** One-line hint shown next to a vendor in the picker: "$175/mo · 87%" */
export function vendorHint(v: VendorOption): string {
	const parts: string[] = [];
	if ((v.monthlyRentCents ?? 0) > 0) parts.push(`$${(v.monthlyRentCents! / 100).toFixed(0)}/mo`);
	if (v.vendorPaymentPercent !== null) parts.push(`${Math.round(v.vendorPaymentPercent)}%`);
	if (v.placed) parts.push('on floor');
	return parts.join(' · ');
}
