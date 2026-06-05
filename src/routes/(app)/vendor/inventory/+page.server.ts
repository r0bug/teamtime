import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { and, eq, sql, desc, max as drizzleMax, sum } from 'drizzle-orm';
import { db, salesTransactions } from '$lib/server/db';
import {
	listForVendor,
	submitChange,
	applyCreateViaApi,
	cancelChange,
	InventoryChangeError,
	type ChangePayload
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
	submit: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });

		const form = await request.formData();
		const changeType = form.get('changeType') as 'create' | 'update' | 'delete';
		const partNumber = ((form.get('partNumber') as string) ?? '').trim();
		const partName = ((form.get('partName') as string) ?? '').trim();
		const description = ((form.get('description') as string) ?? '').trim();
		const priceCents = parsePriceCents(form.get('priceDollars'));
		const quantity = parseInt10(form.get('quantity'));
		const nrsPartId = parseInt10(form.get('nrsPartId'));
		const previousPayloadRaw = form.get('previousPayload');

		if (!changeType || !['create', 'update', 'delete'].includes(changeType)) {
			return fail(400, { error: 'Invalid change type' });
		}
		if (!partNumber) return fail(400, { error: 'Part number is required' });

		const payload: ChangePayload = {};
		if (partName) payload.partName = partName;
		if (description) payload.description = description;
		if (priceCents !== undefined) payload.priceCents = priceCents;
		if (quantity !== undefined) payload.quantity = quantity;

		let previousPayload: Record<string, unknown> | null = null;
		if (previousPayloadRaw && typeof previousPayloadRaw === 'string') {
			try { previousPayload = JSON.parse(previousPayloadRaw); } catch { previousPayload = null; }
		}

		// Resolve vendor through the parent layout's data via DB lookup
		const { getVendorForUser } = await import('$lib/server/services/vendor-service');
		const vendor = await getVendorForUser(locals.user.id);
		if (!vendor) return fail(403, { error: 'Vendor portal access not enabled' });

		let changeId: string;
		try {
			const row = await submitChange({
				vendorId: vendor.id,
				submittedByUserId: locals.user.id,
				changeType,
				nrsPartId: nrsPartId ?? null,
				partNumber,
				payload,
				previousPayload
			});
			changeId = row.id;
		} catch (err) {
			if (err instanceof InventoryChangeError) return fail(400, { error: err.message });
			throw err;
		}

		// New items auto-apply straight to NRS via invstock/save. Updates/deletes
		// stay pending for staff. A failed auto-apply isn't an error — the change
		// is queued for the staff fallback and the journal records why.
		if (changeType === 'create') {
			const apply = await applyCreateViaApi(changeId, locals.user.id);
			return { success: 'submit', applied: apply.applied, applyError: apply.error ?? null };
		}
		return { success: 'submit', applied: false, applyError: null };
	},

	/**
	 * Streamlined "Make a tag" flow. Vendor enters description + price; we
	 * auto-generate a part number `{prefix}{YYYYMMDD}{NNNN}` and queue the
	 * change. The barcode on the printed tag will encode this part number.
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
