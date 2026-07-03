import { and, eq, desc } from 'drizzle-orm';
import {
	db,
	vendorTagSettings,
	pendingInventoryChanges,
	salesTransactions,
	labelFormats
} from '$lib/server/db';
import { renderZpl } from './tag-render-service';
import { getInvStockForVendorCached } from './nrs-api-client';
import type { Vendor } from '$lib/server/db/schema';

/**
 * Shared ZPL-for-a-tag logic, used by both the vendor-session endpoint
 * (`/api/vendor/tag-zpl`) and the manager-gated admin variant
 * (`/api/admin/vendors/:id/tag-zpl`). Keeping it here avoids drift between the
 * two: item resolution, format validation, and render must stay identical.
 */
export class TagZplError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
		this.name = 'TagZplError';
	}
}

/**
 * Throws TagZplError(400) if `formatCode` is set but unknown/inactive or is not a
 * thermal format. A sheet/Avery format can't render as a single thermal ZPL label.
 * A null/undefined formatCode is fine (caller falls back to the vendor's preferred).
 */
export async function assertThermalFormat(formatCode: string | undefined): Promise<void> {
	if (!formatCode) return;
	const [fmt] = await db
		.select({ category: labelFormats.category, isActive: labelFormats.isActive })
		.from(labelFormats)
		.where(eq(labelFormats.code, formatCode))
		.limit(1);
	if (!fmt || !fmt.isActive) throw new TagZplError(`Unknown label format: ${formatCode}`);
	if (fmt.category !== 'thermal') {
		throw new TagZplError(
			`Format ${formatCode} is a sheet format; the ZPL endpoint needs a thermal format`
		);
	}
}

/**
 * Resolve item details for a vendor's part number — the vendor's pending
 * inventory change (freshest) preferred, NRS sales history as fallback — then
 * render the tag as ZPL II. `opts.formatCode` overrides the vendor's preferred
 * format (validate it with assertThermalFormat first). `opts.dpi` overrides the
 * render resolution — the SELECTED PRINTER's dpi (the printer registry is the
 * source of truth); falls back to the vendor's zebraDpi setting / 203 when unset.
 */
export async function renderVendorTagZpl(
	vendor: Vendor,
	partNumber: string,
	opts: { copies?: number; formatCode?: string; headerOverride?: string; dpi?: number } = {}
): Promise<string> {
	let name: string | null = null;
	let description: string | null = null;
	let priceCents: number | null = null;

	const [pending] = await db
		.select()
		.from(pendingInventoryChanges)
		.where(
			and(
				eq(pendingInventoryChanges.vendorId, vendor.id),
				eq(pendingInventoryChanges.partNumber, partNumber)
			)
		)
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
			.where(
				and(
					eq(salesTransactions.vendorId, vendor.nrsVendorId),
					eq(salesTransactions.partNumber, partNumber)
				)
			)
			.orderBy(desc(salesTransactions.invoiceDate))
			.limit(1);
		if (sale) {
			name = name ?? sale.partName;
			if (priceCents === null && sale.price !== null && sale.price !== undefined) {
				priceCents = Math.round(Number(sale.price) * 100);
			}
		}
	}

	// NRS live inventory (cached 60s) — covers UNSOLD stock that has no sale and no
	// pending change, so its tag still carries the item's name/price. The cache means
	// a Print All of a whole inventory does one NRS pull, not one per tag.
	if ((!name || priceCents === null) && vendor.nrsVendorId) {
		try {
			const want = partNumber.trim().toUpperCase();
			const stock = await getInvStockForVendorCached(vendor.nrsVendorId);
			const item = stock.find((i) => (i.partNumber ?? '').trim().toUpperCase() === want);
			if (item) {
				name = name ?? item.name ?? item.displayName ?? null;
				if (!description) description = item.description ?? null;
				if (priceCents === null && item.retailPrice !== null && item.retailPrice !== undefined) {
					priceCents = Math.round(Number(item.retailPrice) * 100);
				}
			}
		} catch {
			// NRS unreachable — render with whatever we already have.
		}
	}

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	// Vertical tag date down the edge — the item's creation date when known,
	// else today (for shelf-age). renderZpl auto-skips it on labels too short
	// to fit a vertical date (barbell/jewelry stock).
	const tagDate = new Date(pending?.submittedAt ?? Date.now());
	const edgeDate = `${String(tagDate.getMonth() + 1).padStart(2, '0')}/${String(tagDate.getDate()).padStart(2, '0')}/${tagDate.getFullYear()}`;

	return renderZpl({
		vendorDisplayName: vendor.displayName,
		headerOverride: opts.headerOverride,
		settings: settings ?? null,
		item: { partNumber, name, description, priceCents },
		copies: opts.copies,
		formatCode: opts.formatCode,
		dpi: opts.dpi,
		edgeDate,
		edgeDateSide: 'right'
	});
}
