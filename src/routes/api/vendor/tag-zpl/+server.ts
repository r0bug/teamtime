import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import {
	db,
	vendorTagSettings,
	pendingInventoryChanges,
	salesTransactions,
	labelFormats
} from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderZpl } from '$lib/server/services/tag-render-service';

/**
 * GET /api/vendor/tag-zpl?partNumber=SR26580001 — returns ZPL II text for a
 * single tag. Resolves item details from the vendor's pending inventory
 * change (preferred — it's the freshest payload) and falls back to NRS sales
 * history when the part has no pending row.
 *
 * The browser fetches this and forwards the body to Zebra Browser Print at
 * localhost:9100. ZPL is plain text; Content-Type stays text/plain.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const partNumber = url.searchParams.get('partNumber')?.trim();
	if (!partNumber) throw error(400, 'partNumber required');

	const copiesRaw = url.searchParams.get('copies');
	let copies: number | undefined = undefined;
	if (copiesRaw !== null) {
		if (!/^\d+$/.test(copiesRaw)) {
			return json({ error: 'copies must be a positive integer' }, { status: 400 });
		}
		copies = parseInt(copiesRaw, 10);
	}

	// Optional label-format override (desktop app picks a thermal format at print
	// time). Omitted → the vendor's preferred format. A sheet/Avery format can't
	// render as one thermal ZPL label, so reject it loudly rather than print garbage.
	const formatCode = url.searchParams.get('format')?.trim() || undefined;
	if (formatCode) {
		const [fmt] = await db
			.select({ category: labelFormats.category, isActive: labelFormats.isActive })
			.from(labelFormats)
			.where(eq(labelFormats.code, formatCode))
			.limit(1);
		if (!fmt || !fmt.isActive) {
			return json({ error: `Unknown label format: ${formatCode}` }, { status: 400 });
		}
		if (fmt.category !== 'thermal') {
			return json(
				{ error: `Format ${formatCode} is a sheet format; the ZPL endpoint needs a thermal format` },
				{ status: 400 }
			);
		}
	}

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');
	const prefix = vendor.inventoryCodePrefix ?? '';
	if (!prefix) {
		// startsWith('') is always true, so without a prefix the ownership
		// check fails open. Refuse rather than render with no scope guard.
		throw error(403, 'Vendor has no inventory code prefix configured');
	}
	if (!partNumber.startsWith(prefix)) {
		throw error(403, 'Part number does not belong to this vendor');
	}

	let name: string | null = null;
	let description: string | null = null;
	let priceCents: number | null = null;

	const [pending] = await db
		.select()
		.from(pendingInventoryChanges)
		.where(and(
			eq(pendingInventoryChanges.vendorId, vendor.id),
			eq(pendingInventoryChanges.partNumber, partNumber)
		))
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(1);

	if (pending && pending.payload) {
		const p = pending.payload as { partName?: string; description?: string; priceCents?: number };
		name = p.partName ?? null;
		description = p.description ?? null;
		priceCents = p.priceCents ?? null;
	}

	if ((!name || priceCents === null) && vendor.nrsVendorId) {
		const [sale] = await db
			.select()
			.from(salesTransactions)
			.where(and(
				eq(salesTransactions.vendorId, vendor.nrsVendorId),
				eq(salesTransactions.partNumber, partNumber)
			))
			.orderBy(desc(salesTransactions.invoiceDate))
			.limit(1);
		if (sale) {
			name = name ?? sale.partName;
			if (priceCents === null && sale.price !== null && sale.price !== undefined) {
				priceCents = Math.round(Number(sale.price) * 100);
			}
		}
	}

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	const zpl = await renderZpl({
		vendorDisplayName: vendor.displayName,
		settings: settings ?? null,
		item: { partNumber, name, description, priceCents },
		copies,
		formatCode
	});

	return new Response(zpl, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
