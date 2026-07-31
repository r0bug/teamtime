/**
 * Vendor inventory snapshot — a local mirror of a vendor's NRS inventory.
 *
 * NRS is the source of truth; this table is a cache that (a) makes the vendor
 * portal fast and searchable server-side despite NRS's 0.1s–25s latency and
 * (b) keeps the portal usable when NRS is unreachable. Reads come from here;
 * writes always go to NRS first (see inventory-change-service).
 *
 * Freshness: `getVendorInventory` returns the mirrored rows immediately and,
 * when they're older than STALE_MS (or absent), kicks off a background refresh
 * so the next load is current — the same stale-while-revalidate shape as the
 * in-memory NRS cache, but durable across restarts and NRS outages.
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	vendorInventorySnapshot,
	type VendorInventorySnapshotRow
} from '$lib/server/db/schema';
import { getAllInvStockForVendor } from '$lib/server/services/nrs-api-client';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor-inventory-snapshot');

const STALE_MS = 5 * 60 * 1000; // consider a mirror older than 5 min stale
const inflight = new Map<string, Promise<void>>();

/**
 * Full-refresh one vendor's snapshot from NRS: fetch all their pass-through
 * items and replace the mirrored rows in a transaction (so items deleted in NRS
 * disappear here too). Throws if NRS is unreachable — callers that just want
 * best-effort freshness should use `refreshInBackground`.
 */
export async function refreshVendorSnapshot(vendorId: string, nrsVendorId: number): Promise<number> {
	const items = await getAllInvStockForVendor(nrsVendorId);
	const now = new Date();
	const rows = items
		.filter((i) => typeof i.invStockId === 'number')
		.map((i) => ({
			vendorId,
			nrsVendorId,
			invStockId: i.invStockId,
			partNumber: i.partNumber ?? null,
			name: i.name ?? null,
			description: i.description ?? null,
			retailPriceCents: Math.round(Number(i.retailPrice ?? 0) * 100),
			active: i.active !== false,
			quantityOnHand: Math.round(Number(i.quantityOnHand ?? 0)),
			syncedAt: now
		}));

	await db.transaction(async (tx) => {
		await tx.delete(vendorInventorySnapshot).where(eq(vendorInventorySnapshot.vendorId, vendorId));
		// Chunked insert keeps the parameter count well under Postgres's limit.
		for (let i = 0; i < rows.length; i += 500) {
			const chunk = rows.slice(i, i + 500);
			if (chunk.length) await tx.insert(vendorInventorySnapshot).values(chunk);
		}
	});

	log.info({ vendorId, nrsVendorId, count: rows.length }, 'Refreshed vendor inventory snapshot');
	return rows.length;
}

/** Public fire-and-forget refresh — call after a create/qty change so the new
 *  state shows on the next load even if the mirror was still "fresh". */
export function queueVendorSnapshotRefresh(vendorId: string, nrsVendorId: number): void {
	refreshInBackground(vendorId, nrsVendorId);
}

/** Fire-and-forget refresh, de-duplicated per vendor; never throws to the caller. */
function refreshInBackground(vendorId: string, nrsVendorId: number): void {
	if (inflight.has(vendorId)) return;
	const p = refreshVendorSnapshot(vendorId, nrsVendorId)
		.catch((err) => log.warn({ vendorId, err: String(err) }, 'Background snapshot refresh failed'))
		.finally(() => inflight.delete(vendorId)) as Promise<void>;
	inflight.set(vendorId, p);
}

export interface VendorInventory {
	items: VendorInventorySnapshotRow[];
	/** Newest row's sync time, or null if the mirror is empty. */
	syncedAt: Date | null;
	/** True when a fresh mirror could not be produced (empty + NRS unreachable). */
	unavailable: boolean;
}

/**
 * Return a vendor's inventory from the mirror (stale-while-revalidate). If the
 * mirror is empty this waits for one synchronous refresh (bounded by NRS); if
 * it has rows but they're stale, it returns them immediately and refreshes in
 * the background.
 */
export async function getVendorInventory(
	vendorId: string,
	nrsVendorId: number
): Promise<VendorInventory> {
	let rows = await readRows(vendorId);

	if (rows.length === 0) {
		// Cold: try one synchronous refresh so the vendor sees their items now.
		try {
			await refreshVendorSnapshot(vendorId, nrsVendorId);
			rows = await readRows(vendorId);
		} catch (err) {
			log.warn({ vendorId, err: String(err) }, 'Cold snapshot refresh failed — NRS unreachable');
			return { items: [], syncedAt: null, unavailable: true };
		}
	} else {
		const newest = rows[0].syncedAt?.getTime() ?? 0;
		if (Date.now() - newest > STALE_MS) refreshInBackground(vendorId, nrsVendorId);
	}

	return { items: rows, syncedAt: rows[0]?.syncedAt ?? null, unavailable: false };
}

async function readRows(vendorId: string): Promise<VendorInventorySnapshotRow[]> {
	return db
		.select()
		.from(vendorInventorySnapshot)
		.where(eq(vendorInventorySnapshot.vendorId, vendorId))
		.orderBy(desc(vendorInventorySnapshot.syncedAt), vendorInventorySnapshot.partNumber);
}

/**
 * Patch a single item's mirrored row right after a successful NRS write, so the
 * vendor sees their change immediately without waiting for a full refresh.
 * Best-effort — a miss just means the row updates on the next refresh.
 */
export async function patchSnapshotItem(
	vendorId: string,
	invStockId: number,
	patch: Partial<Pick<VendorInventorySnapshotRow, 'retailPriceCents' | 'name' | 'description' | 'active' | 'quantityOnHand'>>
): Promise<void> {
	try {
		await db
			.update(vendorInventorySnapshot)
			.set({ ...patch, syncedAt: new Date() })
			.where(and(
				eq(vendorInventorySnapshot.vendorId, vendorId),
				eq(vendorInventorySnapshot.invStockId, invStockId)
			));
	} catch (err) {
		log.warn({ vendorId, invStockId, err: String(err) }, 'patchSnapshotItem failed (non-fatal)');
	}
}
