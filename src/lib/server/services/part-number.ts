/**
 * Vendor ownership check for a part number, against the vendor's inventory code
 * prefix. **Case-insensitive** — prefixes are stored uppercase (setInventoryPrefix
 * normalizes), but part numbers can arrive in any case (manual entry, NRS, older
 * data), so a case-sensitive `startsWith` would wrongly reject a vendor's own item.
 * An empty prefix fails closed (no ownership scope).
 */
export function partNumberMatchesPrefix(partNumber: string, prefix: string): boolean {
	if (!prefix) return false;
	return partNumber.toUpperCase().startsWith(prefix.toUpperCase());
}
