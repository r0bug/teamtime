/**
 * NRS inventory categories for the vendor desktop app's category dropdown.
 * NRS's `invcategory/list` is a slow upstream call and categories rarely change,
 * so the list is cached in-memory with a TTL and served stale on a refresh error.
 */
import { getInvCategories } from '$lib/server/services/nrs-api-client';

export interface VendorCategory {
	id: number;
	name: string;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: { data: VendorCategory[]; at: number } | null = null;

/** Test-only: clear the in-memory cache. */
export function _resetCategoryCacheForTest() {
	cache = null;
}

export async function listVendorCategories(now: number = Date.now()): Promise<VendorCategory[]> {
	if (cache && now - cache.at < TTL_MS) return cache.data;
	try {
		const raw = await getInvCategories();
		const data = raw
			.map((c) => ({ id: c.invCategoryId, name: (c.description ?? c.code ?? '').trim() }))
			.filter((c) => c.name.length > 0)
			.sort((a, b) => a.name.localeCompare(b.name));
		cache = { data, at: now };
		return data;
	} catch (e) {
		if (cache) return cache.data; // stale-on-error beats failing the dropdown
		throw e;
	}
}
