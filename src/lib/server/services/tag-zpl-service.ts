import { and, eq, desc } from 'drizzle-orm';
import { db, vendorTagSettings, pendingInventoryChanges, labelFormats } from '$lib/server/db';
import { renderZpl } from './tag-render-service';
import { getAllInvStockForVendor } from './nrs-api-client';
import type { Vendor } from '$lib/server/db/schema';

/**
 * Shared ZPL-for-a-tag logic, used by both the vendor-session endpoint
 * (`/api/vendor/tag-zpl`) and the manager-gated admin variant
 * (`/api/admin/vendors/:id/tag-zpl`). Keeping it here avoids drift between the
 * two: ownership, item resolution, format validation, and render must stay identical.
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

export interface ResolvedVendorPart {
	owned: boolean;
	name: string | null;
	description: string | null;
	priceCents: number | null;
	/** Item creation/change time for the edge date, when known. */
	submittedAt: Date | null;
}

/**
 * Resolve a vendor's part for reprinting — ownership + display data in one shot.
 *
 * NRS is the source of truth for ownership (hard spec constraint). An item belongs
 * to the vendor iff it appears in that vendor's NRS inventory — an invstock row
 * whose pass-through vendor is this vendor. `getAllInvStockForVendor` runs exactly
 * that query (`passThroughApVendorId` → invstock). This is authoritative even for
 * pre-existing manufacturer UPCs/barcodes that don't carry the vendor prefix (e.g.
 * soda from a shop fridge), and it tracks re-assignments: when inventory is sold or
 * moved from one vendor to another and ownership is re-pointed in NRS, this follows.
 *
 * The only non-NRS source we trust is `pendingInventoryChanges` — a TeamTime table
 * we added so the app can create items. Those may not have synced to NRS yet, so a
 * vendor's own pending change also counts as ownership and supplies fresher data.
 *
 * Prefix matching is deliberately NOT an ownership signal here: it's only correct
 * for GENERATING a new barcode, never for reprinting an existing one.
 */
export async function resolveVendorPart(
	vendor: Vendor,
	partNumber: string
): Promise<ResolvedVendorPart> {
	const wanted = partNumber.trim().toUpperCase();

	// TeamTime added-function table: a vendor's app-created change that may not have
	// been applied to NRS yet. Freshest data when present, and its own ownership proof.
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

	const pendingPayload =
		pending?.payload && typeof pending.payload === 'object'
			? (pending.payload as { partName?: string; description?: string; priceCents?: number })
			: null;

	// NRS = source of truth for ownership: the vendor's invstock (passThroughVendorId
	// → items). The part is theirs iff it's in that set.
	let nrsName: string | null = null;
	let nrsDescription: string | null = null;
	let nrsPriceCents: number | null = null;
	let nrsOwned = false;
	if (vendor.nrsVendorId) {
		const items = await getAllInvStockForVendor(vendor.nrsVendorId);
		const item = items.find((i) => (i.partNumber ?? '').trim().toUpperCase() === wanted);
		if (item) {
			nrsOwned = true;
			nrsName = item.name ?? item.displayName ?? null;
			nrsDescription = item.description ?? null;
			nrsPriceCents =
				item.retailPrice !== null && item.retailPrice !== undefined
					? Math.round(Number(item.retailPrice) * 100)
					: null;
		}
	}

	if (!nrsOwned && pendingPayload === null) {
		return { owned: false, name: null, description: null, priceCents: null, submittedAt: null };
	}

	// Prefer the vendor's pending change for display data (a fresh edit NRS may not
	// reflect yet), falling back to the authoritative NRS row.
	return {
		owned: true,
		name: pendingPayload?.partName ?? nrsName,
		description: pendingPayload?.description ?? nrsDescription,
		priceCents: pendingPayload?.priceCents ?? nrsPriceCents,
		submittedAt: pending?.submittedAt ?? null
	};
}

/**
 * Resolve item details for a vendor's part number and render the tag as ZPL II.
 * Throws TagZplError(403) if the part doesn't belong to the vendor (NRS is the
 * source of truth — see `resolveVendorPart`). `opts.formatCode` overrides the
 * vendor's preferred format (validate it with assertThermalFormat first).
 * `opts.dpi` overrides the render resolution — the SELECTED PRINTER's dpi (the
 * printer registry is the source of truth); falls back to the vendor's zebraDpi
 * setting / 203 when unset.
 */
export async function renderVendorTagZpl(
	vendor: Vendor,
	partNumber: string,
	opts: { copies?: number; formatCode?: string; headerOverride?: string; dpi?: number } = {}
): Promise<string> {
	const part = await resolveVendorPart(vendor, partNumber);
	if (!part.owned) {
		throw new TagZplError('This item does not belong to this vendor', 403);
	}

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	// Vertical tag date down the edge — the item's creation date when known, else
	// today (for shelf-age). renderZpl auto-skips it on labels too short to fit a
	// vertical date (barbell/jewelry stock).
	const tagDate = part.submittedAt ?? new Date();
	const edgeDate = `${String(tagDate.getMonth() + 1).padStart(2, '0')}/${String(tagDate.getDate()).padStart(2, '0')}/${tagDate.getFullYear()}`;

	return renderZpl({
		vendorDisplayName: vendor.displayName,
		headerOverride: opts.headerOverride,
		settings: settings ?? null,
		item: { partNumber, name: part.name, description: part.description, priceCents: part.priceCents },
		copies: opts.copies,
		formatCode: opts.formatCode,
		dpi: opts.dpi,
		edgeDate,
		edgeDateSide: 'right'
	});
}
