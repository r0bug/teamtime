import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { and, eq, sql, desc, max as drizzleMax, sum } from 'drizzle-orm';
import { db, salesTransactions } from '$lib/server/db';
import {
	listForVendor,
	submitChange,
	applyCreateViaApi,
	cancelChange,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();

	let soldItems: { partNumber: string; partName: string | null; lastSold: string; unitsSold: number; lastPrice: number; nrsPartId: number | null }[] = [];

	if (vendor.nrsVendorId) {
		const rows = await db
			.select({
				partId: salesTransactions.partId,
				partNumber: salesTransactions.partNumber,
				partName: salesTransactions.partName,
				lastSold: drizzleMax(salesTransactions.invoiceDate),
				unitsSold: sum(salesTransactions.quantity),
				lastPrice: drizzleMax(salesTransactions.price)
			})
			.from(salesTransactions)
			.where(and(
				eq(salesTransactions.vendorId, vendor.nrsVendorId),
				sql`${salesTransactions.partNumber} IS NOT NULL`
			))
			.groupBy(salesTransactions.partId, salesTransactions.partNumber, salesTransactions.partName)
			.orderBy(desc(drizzleMax(salesTransactions.invoiceDate)))
			.limit(200);

		soldItems = rows
			.filter((r) => r.partNumber)
			.map((r) => ({
				partNumber: r.partNumber as string,
				partName: r.partName,
				lastSold: r.lastSold ?? '',
				unitsSold: Number(r.unitsSold ?? 0),
				lastPrice: Number(r.lastPrice ?? 0),
				nrsPartId: r.partId
			}));
	}

	const pending = await listForVendor(vendor.id);

	return { soldItems, pending };
};

function parsePriceCents(raw: unknown): number | undefined {
	if (raw === null || raw === undefined || raw === '') return undefined;
	const n = parseFloat(String(raw));
	if (!isFinite(n)) return undefined;
	return Math.round(n * 100);
}

function parseInt10(raw: unknown): number | undefined {
	if (raw === null || raw === undefined || raw === '') return undefined;
	const n = parseInt(String(raw), 10);
	if (!isFinite(n)) return undefined;
	return n;
}

export const actions: Actions = {
	// Removal requests only. New items are added exclusively through the
	// "Make a tag" flow (quickTag), which always auto-generates the part number
	// after the vendor code — manual part-number entry is gone because it let
	// vendors save bare prefixes (e.g. "SR"), which collide into duplicates.
	submit: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const form = await request.formData();
		const changeType = form.get('changeType') as string;
		if (changeType !== 'delete') {
			return fail(400, { error: 'Editing and manual adds are disabled. Use “Make a tag” to add an item, or request a removal.' });
		}

		const partNumber = ((form.get('partNumber') as string) ?? '').trim();
		const nrsPartId = parseInt10(form.get('nrsPartId'));
		const reason = ((form.get('reason') as string) ?? '').trim();
		const previousPayloadRaw = form.get('previousPayload');

		if (!partNumber) return fail(400, { error: 'Part number is required' });
		if (!reason) return fail(400, { error: 'Please give a reason for the removal.' });

		let previousPayload: Record<string, unknown> | null = null;
		if (previousPayloadRaw && typeof previousPayloadRaw === 'string') {
			try { previousPayload = JSON.parse(previousPayloadRaw); } catch { previousPayload = null; }
		}

		const { getVendorForUser } = await import('$lib/server/services/vendor-service');
		const vendor = await getVendorForUser(locals.user.id);
		if (!vendor) return fail(403, { error: 'Vendor portal access not enabled' });

		try {
			await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType: 'delete',
				nrsPartId: nrsPartId ?? null,
				partNumber,
				payload: { reason },
				previousPayload
			});
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		return { success: 'submit', changeType: 'delete', applied: false, applyError: null };
	},

	/**
	 * The only "add an item" path. Vendor enters description + price; we always
	 * auto-generate the part number `{prefix}{MDDYY}{NNN}` after the vendor code
	 * (atomic per-vendor/day sequence — no duplicates) and queue the change.
	 * The barcode on the printed tag encodes this part number.
	 */
	quickTag: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const form = await request.formData();
		const description = ((form.get('description') as string) ?? '').trim();
		const priceCents = parsePriceCents(form.get('priceDollars'));
		const quantity = parseInt10(form.get('quantity'));

		if (!description) return fail(400, { error: 'Description is required' });
		if (priceCents === undefined) return fail(400, { error: 'Price is required' });

		const { getVendorForUser, generatePartNumber, VendorServiceError } = await import(
			'$lib/server/services/vendor-service'
		);
		const vendor = await getVendorForUser(locals.user.id);
		if (!vendor) return fail(403, { error: 'Vendor portal access not enabled' });

		let partNumber: string;
		try {
			partNumber = await generatePartNumber(vendor.id);
		} catch (err) {
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
				payload: {
						partName: description,
						description,
						priceCents,
						...(quantity !== undefined ? { quantity } : {})
					},
				previousPayload: null
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		const apply = await applyCreateViaApi(changeId, locals.user.id);
		return { success: 'quickTag', partNumber, description, priceCents, applied: apply.applied, applyError: apply.error ?? null };
	},

	cancel: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const form = await request.formData();
		const changeId = form.get('id') as string;
		if (!changeId) return fail(400, { error: 'id required' });

		const { getVendorForUser } = await import('$lib/server/services/vendor-service');
		const vendor = await getVendorForUser(locals.user.id);
		if (!vendor) return fail(403, { error: 'Vendor portal access not enabled' });

		try {
			await cancelChange(changeId, vendor.id);
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'cancel' };
	}
};
