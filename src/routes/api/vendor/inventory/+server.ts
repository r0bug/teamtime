import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, desc, max as sqlMax, sql } from 'drizzle-orm';
import { db, pendingInventoryChanges, salesTransactions } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { getInvStockForVendorCached } from '$lib/server/services/nrs-api-client';

/**
 * The payload jsonb is stored DOUBLE-ENCODED — a JSON string of a JSON string.
 * Reading `payload->>'x'` in SQL returns empty, so we read the column and parse
 * it in JS, parsing again if the first parse still yields a string.
 */
function parsePayload(raw: unknown): { description?: string; partName?: string; priceCents?: number } {
	let value: unknown = raw;
	for (let i = 0; i < 2 && typeof value === 'string'; i++) {
		try {
			value = JSON.parse(value);
		} catch {
			return {};
		}
	}
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

interface InvItem {
	partNumber: string;
	description: string | null;
	priceCents: number | null;
	sortDate: number; // ms; newest first
}

/**
 * GET /api/vendor/inventory?q=<text>&limit=<n>
 * The calling vendor's FULL inventory, merged from three sources and deduped by
 * partNumber (first writer wins):
 *   1. app/portal-created items (pendingInventoryChanges) — freshest, win on dedupe
 *   2. the vendor's actual NRS stock (invstock/getall, cached) — every item, incl.
 *      unsold; this is the bulk of a real inventory
 *   3. sold parts from sales history (salesTransactions) — catches items sold and
 *      no longer in stock
 * Filtered by q (case-insensitive substring over partNumber / description), newest
 * first (by change date, then partNumber).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const q = url.searchParams.get('q')?.trim().toLowerCase() || '';

	const limitRaw = url.searchParams.get('limit');
	const limitParsed = limitRaw ? parseInt(limitRaw, 10) || 50 : 50;
	const limit = Math.max(1, Math.min(200, limitParsed));

	const matches = (parts: (string | null | undefined)[]): boolean => {
		if (!q) return true;
		return parts.filter(Boolean).join(' ').toLowerCase().includes(q);
	};

	const byPart = new Map<string, InvItem>();

	// 1) App/portal-created items (freshest — these win on dedupe).
	const created = await db
		.select()
		.from(pendingInventoryChanges)
		.where(
			and(
				eq(pendingInventoryChanges.vendorId, vendor.id),
				eq(pendingInventoryChanges.changeType, 'create')
			)
		)
		.orderBy(desc(pendingInventoryChanges.submittedAt));
	for (const r of created) {
		if (!r.partNumber || byPart.has(r.partNumber)) continue;
		const p = parsePayload(r.payload);
		const description =
			typeof p.description === 'string' ? p.description : typeof p.partName === 'string' ? p.partName : null;
		if (!matches([r.partNumber, description])) continue;
		byPart.set(r.partNumber, {
			partNumber: r.partNumber,
			description,
			priceCents: typeof p.priceCents === 'number' ? p.priceCents : null,
			sortDate: r.submittedAt.getTime()
		});
	}

	// 2) The vendor's ACTUAL current NRS inventory — every item in stock, sold or
	//    not. This is the authoritative list and the whole point of the tab: most
	//    items needing a tag are unsold, so a sales-only list hid the majority.
	//    Cached 60s so search-as-you-type stays fast; on an NRS hiccup we degrade
	//    to sales + pending (previous behaviour).
	if (vendor.nrsVendorId) {
		try {
			const stock = await getInvStockForVendorCached(vendor.nrsVendorId);
			for (const i of stock) {
				const pn = i.partNumber;
				if (!pn || byPart.has(pn)) continue; // app-created already won
				const name = i.name ?? i.displayName ?? null;
				if (!matches([pn, name])) continue;
				const changed = i.latestChangeDateTime
					? new Date(i.latestChangeDateTime).getTime()
					: NaN;
				byPart.set(pn, {
					partNumber: pn,
					description: name,
					priceCents: i.retailPrice != null ? Math.round(Number(i.retailPrice) * 100) : null,
					sortDate: Number.isFinite(changed) ? changed : 0
				});
			}
		} catch {
			// NRS unreachable — fall through to sales + pending below.
		}
	}

	// 3) Sold parts from sales history — adds anything sold that's no longer in
	//    current NRS stock (and supplies last-sold price when stock is absent).
	if (vendor.nrsVendorId) {
		const nrs = await db
			.select({
				partNumber: salesTransactions.partNumber,
				partName: salesTransactions.partName,
				lastPrice: sqlMax(salesTransactions.price),
				lastSold: sqlMax(salesTransactions.invoiceDate)
			})
			.from(salesTransactions)
			.where(
				and(
					eq(salesTransactions.vendorId, vendor.nrsVendorId),
					sql`${salesTransactions.partNumber} IS NOT NULL`
				)
			)
			.groupBy(salesTransactions.partNumber, salesTransactions.partName);
		for (const r of nrs) {
			if (!r.partNumber || byPart.has(r.partNumber)) continue; // app-created already won
			if (!matches([r.partNumber, r.partName])) continue;
			byPart.set(r.partNumber, {
				partNumber: r.partNumber,
				description: r.partName ?? null,
				priceCents: r.lastPrice != null ? Math.round(Number(r.lastPrice) * 100) : null,
				sortDate: r.lastSold ? new Date(r.lastSold).getTime() : 0
			});
		}
	}

	const items = Array.from(byPart.values())
		.sort((a, b) => b.sortDate - a.sortDate || b.partNumber.localeCompare(a.partNumber))
		.slice(0, limit)
		.map(({ partNumber, description, priceCents }) => ({ partNumber, description, priceCents }));

	return json({ items });
};
