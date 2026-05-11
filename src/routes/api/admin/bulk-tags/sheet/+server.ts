import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import { db, vendors, vendorTagSettings } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import {
	renderAverySheetHtml,
	type AverySheetItem
} from '$lib/server/services/tag-render-service';

interface InputItem {
	partNumber: string;
	vendorId: string;
	description: string;
	priceCents: number;
	copies?: number;
}

interface RequestBody {
	formatCode: string;
	startPosition?: number;
	monthCode?: string;
	items: InputItem[];
}

/**
 * POST /api/admin/bulk-tags/sheet
 *
 * Renders a mixed-vendor Avery sheet. Each item carries its own vendor;
 * the renderer looks up that vendor's tag settings + display name so the
 * printed sheet keeps per-tag branding even when rows belong to different
 * vendors. The optional `monthCode` is stamped as a bold badge in the
 * top-right corner of every tag.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = (await request.json()) as RequestBody;
	const items = Array.isArray(body?.items) ? body.items : [];
	if (items.length === 0) throw error(400, 'No items supplied');

	const vendorIds = Array.from(new Set(items.map((i) => i.vendorId).filter(Boolean)));
	if (vendorIds.length === 0) throw error(400, 'Items missing vendorId');

	const vendorRows = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName
		})
		.from(vendors)
		.where(inArray(vendors.id, vendorIds));
	const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

	const settingsRows = await db
		.select()
		.from(vendorTagSettings)
		.where(inArray(vendorTagSettings.vendorId, vendorIds));
	const settingsByVendor = new Map(settingsRows.map((s) => [s.vendorId, s]));

	const sheetItems: AverySheetItem[] = items.map((it) => {
		const v = vendorById.get(it.vendorId);
		const settings = settingsByVendor.get(it.vendorId) ?? null;
		return {
			partNumber: it.partNumber,
			name: it.description,
			description: it.description,
			priceCents: it.priceCents,
			copies: Math.max(1, Math.min(it.copies ?? 1, 100)),
			vendorDisplayName: v?.displayName ?? 'Yakima Finds',
			settings
		};
	});

	const html = await renderAverySheetHtml({
		formatCode: body.formatCode || 'avery_5160',
		startPosition: body.startPosition ?? 1,
		// Fallbacks when an item has no vendor-specific override; for mixed
		// sheets these are rarely used since every item carries its own.
		vendorDisplayName: 'Yakima Finds',
		settings: null,
		monthCode: body.monthCode ?? null,
		items: sheetItems
	});

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
