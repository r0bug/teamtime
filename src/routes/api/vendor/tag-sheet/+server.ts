import { partNumberMatchesPrefix } from '$lib/server/services/part-number';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { and, eq, inArray, desc } from 'drizzle-orm';
import {
	db,
	vendorTagSettings,
	pendingInventoryChanges,
	salesTransactions
} from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderAverySheetHtml, type AverySheetItem } from '$lib/server/services/tag-render-service';

interface RequestBody {
	formatCode?: string;
	startPosition?: number;
	items?: Array<{ partNumber: string; copies?: number }>;
}

/**
 * POST /api/vendor/tag-sheet — returns a complete printable HTML page
 * laying out the supplied items in their cells. The browser loads this in
 * an iframe srcdoc and triggers .contentWindow.print().
 *
 * Authoritative item data is resolved server-side from pendingInventoryChanges
 * (preferred) with fallback to sales history. Vendors can only print their own
 * part numbers — the prefix check enforces this.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const body = (await request.json()) as RequestBody;
	const requested = (body.items ?? []).filter((i) => i?.partNumber);
	if (requested.length === 0) throw error(400, 'No items supplied');

	const prefix = vendor.inventoryCodePrefix ?? '';
	if (!prefix) {
		// startsWith('') is always true, so without a prefix the ownership
		// check fails open. Refuse rather than render with no scope guard.
		throw error(403, 'Vendor has no inventory code prefix configured');
	}
	for (const it of requested) {
		if (!partNumberMatchesPrefix(it.partNumber, prefix)) {
			throw error(403, `Part ${it.partNumber} does not belong to this vendor`);
		}
	}

	const partNumbers = Array.from(new Set(requested.map((r) => r.partNumber)));

	const pending = await db
		.select()
		.from(pendingInventoryChanges)
		.where(and(
			eq(pendingInventoryChanges.vendorId, vendor.id),
			inArray(pendingInventoryChanges.partNumber, partNumbers)
		))
		.orderBy(desc(pendingInventoryChanges.submittedAt));

	const dataByPart = new Map<string, { name: string | null; description: string | null; priceCents: number | null }>();
	for (const p of pending) {
		if (dataByPart.has(p.partNumber)) continue; // first hit (most recent) wins
		const payload = (p.payload ?? {}) as { partName?: string; description?: string; priceCents?: number };
		dataByPart.set(p.partNumber, {
			name: payload.partName ?? null,
			description: payload.description ?? null,
			priceCents: payload.priceCents ?? null
		});
	}

	const missing = partNumbers.filter((pn) => !dataByPart.has(pn));
	if (missing.length > 0 && vendor.nrsVendorId) {
		const sales = await db
			.select()
			.from(salesTransactions)
			.where(and(
				eq(salesTransactions.vendorId, vendor.nrsVendorId),
				inArray(salesTransactions.partNumber, missing)
			))
			.orderBy(desc(salesTransactions.invoiceDate));
		for (const s of sales) {
			if (!s.partNumber || dataByPart.has(s.partNumber)) continue;
			dataByPart.set(s.partNumber, {
				name: s.partName,
				description: null,
				priceCents: s.price !== null && s.price !== undefined ? Math.round(Number(s.price) * 100) : null
			});
		}
	}

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	const items: AverySheetItem[] = requested.map((r) => {
		const data = dataByPart.get(r.partNumber);
		return {
			partNumber: r.partNumber,
			name: data?.name ?? null,
			description: data?.description ?? null,
			priceCents: data?.priceCents ?? null,
			copies: r.copies
		};
	});

	const html = await renderAverySheetHtml({
		formatCode: body.formatCode || settings?.preferredFormat || 'avery_5160',
		startPosition: body.startPosition ?? 1,
		vendorDisplayName: vendor.displayName,
		settings: settings ?? null,
		items
	});

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
