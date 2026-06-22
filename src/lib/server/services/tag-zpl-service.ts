import { and, eq, desc } from 'drizzle-orm';
import {
	db,
	vendorTagSettings,
	pendingInventoryChanges,
	salesTransactions,
	labelFormats
} from '$lib/server/db';
import { renderZpl } from './tag-render-service';
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
 * format (validate it with assertThermalFormat first).
 */
export async function renderVendorTagZpl(
	vendor: Vendor,
	partNumber: string,
	opts: { copies?: number; formatCode?: string } = {}
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
		settings: settings ?? null,
		item: { partNumber, name, description, priceCents },
		copies: opts.copies,
		formatCode: opts.formatCode,
		edgeDate,
		edgeDateSide: 'right'
	});
}
