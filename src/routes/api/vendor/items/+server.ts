import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { and, eq, gt, desc } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';

/**
 * GET /api/vendor/items?modified_since=<iso8601>&limit=<n>
 * Returns the calling vendor's items as recorded in pendingInventoryChanges.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) return json({ error: 'Vendor portal access not enabled' }, { status: 403 });

	const sinceRaw = url.searchParams.get('modified_since');
	let since: Date | null = null;
	if (sinceRaw) {
		since = new Date(sinceRaw);
		if (isNaN(since.getTime())) {
			return json({ error: 'modified_since must be ISO 8601' }, { status: 400 });
		}
	}

	const limitRaw = url.searchParams.get('limit');
	const limitParsed = limitRaw ? parseInt(limitRaw, 10) || 200 : 200;
	const limit = Math.max(1, Math.min(1000, limitParsed));

	const conditions = since
		? and(eq(pendingInventoryChanges.vendorId, vendor.id), gt(pendingInventoryChanges.submittedAt, since))
		: eq(pendingInventoryChanges.vendorId, vendor.id);

	const rows = await db
		.select()
		.from(pendingInventoryChanges)
		.where(conditions)
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(limit);

	return json({
		serverTime: new Date().toISOString(),
		items: rows.map((r) => ({
			partNumber: r.partNumber,
			changeType: r.changeType,
			payload: r.payload,
			submittedAt: r.submittedAt
		}))
	});
};

/**
 * POST /api/vendor/items — create a new item from the desktop label app.
 *
 * JSON clone of the web portal's quickTag form action: auto-generates the part
 * number, queues the create, auto-applies it to NRS, and (optionally) enqueues a
 * print job tagged source='desktop'. Body:
 *   { description: string, priceDollars: number, quantity?: int, sendToPrinter?: bool }
 * Returns { partNumber, applied, applyError, queuedForPrint, queueError }.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) return json({ error: 'Vendor portal access not enabled' }, { status: 403 });

	let body: {
		description?: string;
		priceDollars?: number | string;
		quantity?: number | string;
		categoryId?: number | string;
		sendToPrinter?: boolean;
	} = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const description = (body.description ?? '').toString().trim();
	if (!description) return json({ error: 'description is required' }, { status: 400 });

	const priceNum =
		typeof body.priceDollars === 'number' ? body.priceDollars : parseFloat(String(body.priceDollars));
	if (!isFinite(priceNum)) return json({ error: 'priceDollars is required' }, { status: 400 });
	const priceCents = Math.round(priceNum * 100);

	let quantity: number | undefined = undefined;
	if (body.quantity !== undefined && body.quantity !== null && body.quantity !== '') {
		const q = parseInt(String(body.quantity), 10);
		if (isFinite(q)) quantity = q;
	}
	let categoryId: number | undefined = undefined;
	if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
		const c = parseInt(String(body.categoryId), 10);
		if (isFinite(c)) categoryId = c;
	}
	const sendToPrinter = body.sendToPrinter === true;

	const { generatePartNumber, VendorServiceError } = await import(
		'$lib/server/services/vendor-service'
	);
	let partNumber: string;
	try {
		partNumber = await generatePartNumber(vendor.id);
	} catch (err) {
		if (err instanceof VendorServiceError) return json({ error: err.message }, { status: 400 });
		throw err;
	}

	const { submitChange, applyCreateViaApi, InventoryChangeError } = await import(
		'$lib/server/services/inventory-change-service'
	);
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
				...(quantity !== undefined ? { quantity } : {}),
				...(categoryId !== undefined ? { categoryId } : {})
			},
			previousPayload: null
		});
		changeId = row.id;
	} catch (err) {
		if (err instanceof InventoryChangeError) return json({ error: err.message }, { status: 400 });
		throw err;
	}

	const apply = await applyCreateViaApi(changeId, locals.user.id);

	let queuedForPrint = false;
	let queueError: string | null = null;
	if (sendToPrinter) {
		const { enqueuePrintJob } = await import('$lib/server/services/print-queue-service');
		try {
			await enqueuePrintJob({
				vendorId: vendor.id,
				partNumber,
				copies: quantity ?? 1,
				description,
				priceCents,
				pendingChangeId: changeId,
				createdByUserId: locals.user.id,
				source: 'desktop'
			});
			queuedForPrint = true;
		} catch (err) {
			queueError = err instanceof Error ? err.message : 'Could not queue for the label printer';
		}
	}

	return json({
		partNumber,
		applied: apply.applied,
		applyError: apply.error ?? null,
		queuedForPrint,
		queueError
	});
};
