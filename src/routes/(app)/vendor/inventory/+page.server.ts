import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { and, eq, sql, desc, max as drizzleMax, sum } from 'drizzle-orm';
import { db, salesTransactions } from '$lib/server/db';
import {
	listForVendor,
	submitChange,
	applyCreateViaApi,
	applyUpdateViaApi,
	applyDeactivateViaApi,
	cancelChange,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';
import {
	getVendorInventory,
	patchSnapshotItem,
	queueVendorSnapshotRefresh
} from '$lib/server/services/vendor-inventory-snapshot-service';
import { getVendorForUser, generatePartNumber, VendorServiceError } from '$lib/server/services/vendor-service';
import { enqueuePrintJob } from '$lib/server/services/print-queue-service';

// Storlie's/house vendor (17009) has the ENTIRE store catalog attached as
// pass-through — see nrs-invstock-behavior memory. Never let bulk actions or a
// full-catalog render run for it.
const HOUSE_NRS_VENDOR_ID = 17009;
// Cap the rendered live list; Phase 2 (DB mirror) makes this server-paginated.
const MAX_LIVE_ITEMS = 600;

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();

	// Sales context (last sold / units sold / last price) keyed by partNumber.
	const salesByPart = new Map<
		string,
		{ lastSold: string; unitsSold: number; lastPrice: number }
	>();
	if (vendor.nrsVendorId) {
		const rows = await db
			.select({
				partNumber: salesTransactions.partNumber,
				lastSold: drizzleMax(salesTransactions.invoiceDate),
				unitsSold: sum(salesTransactions.quantity),
				lastPrice: drizzleMax(salesTransactions.price)
			})
			.from(salesTransactions)
			.where(and(
				eq(salesTransactions.vendorId, vendor.nrsVendorId),
				sql`${salesTransactions.partNumber} IS NOT NULL`
			))
			.groupBy(salesTransactions.partNumber)
			.orderBy(desc(drizzleMax(salesTransactions.invoiceDate)))
			.limit(2000);
		for (const r of rows) {
			if (!r.partNumber) continue;
			salesByPart.set(r.partNumber, {
				lastSold: r.lastSold ?? '',
				unitsSold: Number(r.unitsSold ?? 0),
				lastPrice: Number(r.lastPrice ?? 0)
			});
		}
	}

	// Live NRS inventory (source of truth) — SWR cached; degrade gracefully.
	const isHouseVendor = vendor.nrsVendorId === HOUSE_NRS_VENDOR_ID;
	let items: Array<{
		invStockId: number;
		partNumber: string | null;
		name: string | null;
		description: string | null;
		retailPrice: number;
		active: boolean;
		quantityOnHand: number;
		lastSold: string;
		unitsSold: number;
	}> = [];
	let inventoryPartial = false;
	let inventoryError: string | null = null;
	let totalItemCount = 0;
	let syncedAt: string | null = null;

	if (vendor.nrsVendorId && !isHouseVendor) {
		// Read from the local mirror (stale-while-revalidate against NRS). This
		// keeps the page fast and usable even when NRS is having a slow spell.
		const inv = await getVendorInventory(vendor.id, vendor.nrsVendorId);
		syncedAt = inv.syncedAt?.toISOString() ?? null;
		if (inv.unavailable) {
			inventoryError =
				'Inventory is loading from NRS for the first time — refresh in a moment. Your recent changes are safe.';
		} else {
			totalItemCount = inv.items.length;
			items = inv.items
				.slice(0, MAX_LIVE_ITEMS)
				.map((i) => {
					const s = i.partNumber ? salesByPart.get(i.partNumber) : undefined;
					return {
						invStockId: i.invStockId,
						partNumber: i.partNumber,
						name: i.name,
						description: i.description,
						retailPrice: (i.retailPriceCents ?? 0) / 100,
						active: i.active !== false,
						quantityOnHand: i.quantityOnHand ?? 0,
						lastSold: s?.lastSold ?? '',
						unitsSold: s?.unitsSold ?? 0
					};
				})
				.sort((a, b) => (a.partNumber ?? '').localeCompare(b.partNumber ?? ''));
			inventoryPartial = totalItemCount > MAX_LIVE_ITEMS;
		}
	}

	return {
		items,
		totalItemCount,
		inventoryPartial,
		inventoryError,
		syncedAt,
		isHouseVendor,
		pending: await listForVendor(vendor.id)
	};
};

function parsePriceCents(raw: unknown): number | undefined {
	if (raw === null || raw === undefined || raw === '') return undefined;
	const n = parseFloat(String(raw));
	if (!isFinite(n) || n < 0) return undefined;
	return Math.round(n * 100);
}

function parseInt10(raw: unknown): number | undefined {
	if (raw === null || raw === undefined || raw === '') return undefined;
	const n = parseInt(String(raw), 10);
	if (!isFinite(n)) return undefined;
	return n;
}

async function requireVendor(userId: string) {
	const vendor = await getVendorForUser(userId);
	if (!vendor) throw new InventoryChangeError('Vendor portal access not enabled');
	return vendor;
}

// Enqueue a reprint at the new price; non-fatal (item already correct in NRS).
async function reprint(vendor: { id: string }, partNumber: string, description: string, priceCents: number, changeId: string, userId: string): Promise<string | null> {
	try {
		await enqueuePrintJob({
			vendorId: vendor.id,
			partNumber,
			copies: 1,
			description,
			priceCents,
			pendingChangeId: changeId,
			createdByUserId: userId,
			source: 'web_portal'
		});
		return null;
	} catch (err) {
		return err instanceof Error ? err.message : 'Could not queue reprint';
	}
}

export const actions: Actions = {
	/**
	 * Add a brand-new item. Part number auto-generated after the vendor code;
	 * NRS-first (hard-fail if the NRS create doesn't land), then queue a tag.
	 */
	quickTag: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const description = ((form.get('description') as string) ?? '').trim();
		const priceCents = parsePriceCents(form.get('priceDollars'));
		const quantity = parseInt10(form.get('quantity'));

		if (!description) return fail(400, { error: 'Description is required' });
		if (priceCents === undefined) return fail(400, { error: 'Price is required' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }

		let partNumber: string;
		try { partNumber = await generatePartNumber(vendor.id); }
		catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}

		let changeId: string;
		try {
			const row = await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType: 'create',
				partNumber,
				payload: { partName: description, description, priceCents, ...(quantity !== undefined ? { quantity } : {}) },
				previousPayload: null
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		const apply = await applyCreateViaApi(changeId, locals.user.id);
		if (!apply.applied) {
			return fail(502, {
				error: `Couldn't add this item to NRS, so it was not created${apply.error ? `: ${apply.error}` : ''}. Nothing was queued to print.`
			});
		}
		if (vendor.nrsVendorId) queueVendorSnapshotRefresh(vendor.id, vendor.nrsVendorId);

		const queueError = await reprint(vendor, partNumber, description, priceCents, changeId, locals.user.id);
		return { success: 'quickTag', partNumber, description, priceCents, queuedForPrint: !queueError, queueError };
	},

	/**
	 * Edit an existing item's price and/or description. Applies to NRS
	 * immediately (full trust); on an NRS write failure it stays pending for
	 * staff (non-fatal — the item already exists in NRS). A price change queues
	 * a reprint at the new price.
	 */
	editItem: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const partNumber = ((form.get('partNumber') as string) ?? '').trim();
		const nrsPartId = parseInt10(form.get('nrsPartId'));
		const description = ((form.get('description') as string) ?? '').trim();
		const priceCents = parsePriceCents(form.get('priceDollars'));
		const prevPriceCents = parsePriceCents(form.get('prevPriceDollars'));
		const prevDescription = ((form.get('prevDescription') as string) ?? '').trim();

		if (!partNumber || !nrsPartId) return fail(400, { error: 'Missing item reference' });
		if (priceCents === undefined && !description) {
			return fail(400, { error: 'Enter a new price or description' });
		}

		const payload: Record<string, unknown> = {};
		if (priceCents !== undefined && priceCents !== prevPriceCents) payload.priceCents = priceCents;
		if (description && description !== prevDescription) {
			payload.description = description;
			payload.partName = description;
		}
		if (Object.keys(payload).length === 0) return fail(400, { error: 'No changes to save' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }

		let changeId: string;
		try {
			const row = await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType: 'update',
				nrsPartId,
				partNumber,
				payload,
				previousPayload: { priceCents: prevPriceCents, description: prevDescription }
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		const apply = await applyUpdateViaApi(changeId, locals.user.id);
		let queueError: string | null = null;
		if (apply.applied) {
			const patch: Record<string, unknown> = {};
			if (payload.priceCents !== undefined) patch.retailPriceCents = payload.priceCents;
			if (payload.description !== undefined) { patch.description = payload.description; patch.name = payload.partName; }
			await patchSnapshotItem(vendor.id, nrsPartId, patch);
			if (payload.priceCents !== undefined) {
				queueError = await reprint(vendor, partNumber, description || prevDescription, payload.priceCents as number, changeId, locals.user.id);
			}
		}
		return {
			success: 'editItem',
			partNumber,
			applied: apply.applied,
			applyError: apply.error ?? null,
			queuedForPrint: apply.applied && payload.priceCents !== undefined ? !queueError : false
		};
	},

	/**
	 * Add stock to an existing item (+N on-hand). Applied against the live NRS
	 * on-hand at apply time; queues N tags on success.
	 */
	addStock: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const partNumber = ((form.get('partNumber') as string) ?? '').trim();
		const nrsPartId = parseInt10(form.get('nrsPartId'));
		const addQty = parseInt10(form.get('addQty'));
		const description = ((form.get('description') as string) ?? '').trim();
		const priceCents = parsePriceCents(form.get('priceDollars'));

		if (!partNumber || !nrsPartId) return fail(400, { error: 'Missing item reference' });
		if (addQty === undefined || addQty <= 0) return fail(400, { error: 'Enter how many to add (1 or more)' });
		if (addQty > 500) return fail(400, { error: 'Add at most 500 at a time' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }

		let changeId: string;
		try {
			const row = await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType: 'update',
				nrsPartId,
				partNumber,
				payload: { quantityDelta: addQty },
				previousPayload: null
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		const apply = await applyUpdateViaApi(changeId, locals.user.id);
		let queueError: string | null = null;
		if (apply.applied) {
			if (vendor.nrsVendorId) queueVendorSnapshotRefresh(vendor.id, vendor.nrsVendorId);
			try {
				await enqueuePrintJob({
					vendorId: vendor.id, partNumber, copies: addQty,
					description: description || partNumber, priceCents: priceCents ?? 0,
					pendingChangeId: changeId, createdByUserId: locals.user.id, source: 'web_portal'
				});
			} catch (err) { queueError = err instanceof Error ? err.message : 'Could not queue tags'; }
		}
		return { success: 'addStock', partNumber, addQty, applied: apply.applied, applyError: apply.error ?? null, queuedForPrint: apply.applied && !queueError };
	},

	/**
	 * Deactivate an item (NRS-inactive, never deleted — owner policy). Applied
	 * immediately; stays pending for staff on NRS failure.
	 */
	deactivate: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const partNumber = ((form.get('partNumber') as string) ?? '').trim();
		const nrsPartId = parseInt10(form.get('nrsPartId'));
		const reason = ((form.get('reason') as string) ?? '').trim();

		if (!partNumber || !nrsPartId) return fail(400, { error: 'Missing item reference' });
		if (!reason) return fail(400, { error: 'Please give a reason' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }

		let changeId: string;
		try {
			const row = await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType: 'delete',
				nrsPartId,
				partNumber,
				payload: { reason },
				previousPayload: null
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		const apply = await applyDeactivateViaApi(changeId, locals.user.id);
		if (apply.applied) await patchSnapshotItem(vendor.id, nrsPartId, { active: false });
		return { success: 'deactivate', partNumber, applied: apply.applied, applyError: apply.error ?? null };
	},

	/**
	 * Bulk price change over selected items: percent reduction or absolute set.
	 * One submit → one update change per item, each applied to NRS + reprinted.
	 * Disabled for the house vendor (owns the whole catalog).
	 */
	bulkPrice: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const mode = form.get('mode') as string; // 'percent' | 'set'
		const amount = parseFloat(String(form.get('amount') ?? ''));
		const selected = form.getAll('selected').map(String); // "nrsPartId|partNumber|priceCents|description"

		if (!selected.length) return fail(400, { error: 'Select at least one item' });
		if (!isFinite(amount)) return fail(400, { error: 'Enter an amount' });
		if (mode === 'percent' && (amount <= 0 || amount >= 100)) return fail(400, { error: 'Percent must be between 0 and 100' });
		if (mode === 'set' && amount < 0) return fail(400, { error: 'Price cannot be negative' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }
		if (vendor.nrsVendorId === HOUSE_NRS_VENDOR_ID) {
			return fail(400, { error: 'Bulk pricing is disabled for the house account.' });
		}

		let applied = 0;
		let failed = 0;
		for (const row of selected) {
			const [idStr, partNumber, prevCentsStr, description] = row.split('|');
			const nrsPartId = parseInt10(idStr);
			const prevCents = parseInt10(prevCentsStr) ?? 0;
			if (!nrsPartId || !partNumber) { failed++; continue; }

			const newCents = mode === 'percent'
				? Math.max(0, Math.round(prevCents * (1 - amount / 100)))
				: Math.round(amount * 100);
			if (newCents === prevCents) continue;

			try {
				const change = await submitChange({
					vendorId: vendor.id,
					submittedByUserId: locals.user.id,
					changeType: 'update',
					nrsPartId,
					partNumber,
					payload: { priceCents: newCents },
					previousPayload: { priceCents: prevCents }
				});
				const apply = await applyUpdateViaApi(change.id, locals.user.id);
				if (apply.applied) {
					applied++;
					await patchSnapshotItem(vendor.id, nrsPartId, { retailPriceCents: newCents });
					await reprint(vendor, partNumber, description ?? partNumber, newCents, change.id, locals.user.id);
				} else {
					failed++;
				}
			} catch { failed++; }
		}
		return { success: 'bulkPrice', applied, failed };
	},

	cancel: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const changeId = form.get('id') as string;
		if (!changeId) return fail(400, { error: 'id required' });

		let vendor;
		try { vendor = await requireVendor(locals.user.id); }
		catch (err) { return fail(403, { error: (err as Error).message }); }

		try {
			await cancelChange(changeId, vendor.id);
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'cancel' };
	}
};
