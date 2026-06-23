/**
 * Tag rendering — produces SVG for screen preview / Avery sheets, and (later)
 * ZPL for Zebra thermal printers. Uses bwip-js for Code 128 barcode SVG.
 */

import bwipjs from 'bwip-js/node';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { labelFormats, type VendorTagSettings } from '$lib/server/db/schema';

export interface TagItem {
	partNumber: string; // becomes the barcode + the human-readable line under it
	name?: string | null;
	description?: string | null;
	priceCents?: number | null;
}

export interface TagRenderContext {
	vendorDisplayName: string;
	settings: VendorTagSettings | null; // null → defaults
	item: TagItem;
	/**
	 * Optional 3-letter month code (e.g. "MAY") rendered as a bold badge in the
	 * top-right corner. Used by the staff bulk tag designer to mark shelf-age.
	 */
	monthCode?: string | null;
	/** Number of copies to print (^PQ). Clamped to [1, 99]; defaults to 1. */
	copies?: number;
	/**
	 * Override the label format code for this render. When set, takes priority
	 * over `settings.preferredFormat` — lets the desktop app print a vendor's
	 * item on whichever label stock is loaded. Falls back to settings/defaults.
	 */
	formatCode?: string | null;
	/** Override DPI for thermal rendering (else settings.zebraDpi or 203). */
	dpi?: number | null;
	/**
	 * Optional date string printed vertically (rotated 90°) along an edge — e.g.
	 * the tag/created date for shelf-age. Auto-skipped on labels too short to fit
	 * it (barbell/jewelry stock).
	 */
	edgeDate?: string | null;
	/** Which edge the vertical date sits on. Default 'right'. */
	edgeDateSide?: 'left' | 'right';
}

/**
 * A printable end-pad of a barbell/rat-tail tag, in inches from the label's
 * left edge. The gap between pads is the fold/neck and prints blank.
 */
export interface BarbellPad {
	role: 'barcode' | 'info';
	xIn: number;
	widthIn: number;
	/** Barcode pad only: explicit barcode height in inches. Tunable from the DB
	 *  (shape_dims_json) so height changes need no rebuild. Defaults to ~45% of
	 *  label height when omitted. */
	barcodeHeightIn?: number;
}
/** Per-line font multipliers (default 1.0 each), stored per format in
 *  shape_dims_json so sizing is tunable without a rebuild. */
export interface LineScales {
	header?: number;
	barcode?: number;
	partNumber?: number;
	description?: number;
	price?: number;
	footer?: number;
}
export interface BarbellShapeDims {
	pads?: BarbellPad[];
	lineScales?: LineScales;
}

export interface TagDimensions {
	widthInches: number;
	heightInches: number;
	cssClass: string;
	/** 'rectangle' | 'barbell' | 'circle' | 'custom' — drives layout. */
	mediaShape?: string;
	/** Per-pad geometry for barbell stock; null for plain rectangles. */
	shapeDims?: BarbellShapeDims | null;
}

// Hard-coded fallback in case the DB lookup misses (offline mode, race
// during a deploy, etc). Mirrors the original seed values.
const FALLBACK_DIMENSIONS: Record<string, TagDimensions> = {
	avery_5160: { widthInches: 2.625, heightInches: 1.0, cssClass: 'tag-avery-5160' },
	avery_5163: { widthInches: 4.0, heightInches: 2.0, cssClass: 'tag-avery-5163' },
	avery_5167: { widthInches: 1.75, heightInches: 0.5, cssClass: 'tag-avery-5167' },
	zebra_2x1: { widthInches: 2.25, heightInches: 1.25, cssClass: 'tag-zebra-2x1' },
	zebra_4x2: { widthInches: 4.0, heightInches: 2.0, cssClass: 'tag-zebra-4x2' }
};

/**
 * Resolve label dimensions for a given format code by querying the
 * `label_formats` table. Falls back to the hardcoded seeds if the row is
 * missing (admin archived it, etc).
 */
export async function getFormatDimensions(format: string): Promise<TagDimensions> {
	const [row] = await db
		.select()
		.from(labelFormats)
		.where(eq(labelFormats.code, format))
		.limit(1);
	if (row) {
		return {
			widthInches: parseFloat(row.labelWidthInches),
			heightInches: parseFloat(row.labelHeightInches),
			cssClass: `tag-${row.code.replace(/_/g, '-')}`,
			mediaShape: row.mediaShape ?? undefined,
			shapeDims: (row.shapeDimsJson as BarbellShapeDims | null) ?? null
		};
	}
	return FALLBACK_DIMENSIONS[format] ?? FALLBACK_DIMENSIONS.avery_5160;
}

/** Resolve effective settings, applying defaults for any null fields. */
export function resolveSettings(s: VendorTagSettings | null) {
	return {
		headerLine: s?.headerLine ?? null,
		footerLine: s?.footerLine ?? null,
		includeDescription: s?.includeDescription ?? true,
		includePartNumber: s?.includePartNumber ?? true,
		includePrice: s?.includePrice ?? true,
		includeBarcode: s?.includeBarcode ?? true,
		barcodeSymbology: s?.barcodeSymbology ?? 'code_128',
		preferredFormat: s?.preferredFormat ?? 'avery_5160',
		zebraDpi: s?.zebraDpi ?? 203,
		fontScale: s?.fontScale ?? 'medium'
	};
}

export type BarcodeSymbology = 'code_128' | 'datamatrix';

/**
 * Generate barcode SVG markup. `code_128` is a 1D linear barcode (most
 * universal); `datamatrix` is a 2D square barcode (~3× more compact, needs
 * an imaging POS scanner).
 */
export async function renderBarcodeSvg(
	text: string,
	opts?: { heightMm?: number; widthMm?: number; symbology?: BarcodeSymbology }
): Promise<string> {
	const symbology = opts?.symbology ?? 'code_128';
	const bcid = symbology === 'datamatrix' ? 'datamatrix' : 'code128';

	const bwipOpts: Record<string, unknown> = {
		bcid,
		text,
		scale: 2,
		includetext: false,
		paddingleft: 0,
		paddingright: 0
	};
	if (symbology === 'code_128') {
		bwipOpts.height = opts?.heightMm ?? 8;
		if (opts?.widthMm) bwipOpts.width = opts.widthMm;
	} else {
		// Data Matrix is square; use the smaller of the two dims as the size.
		const sz = Math.min(opts?.heightMm ?? 10, opts?.widthMm ?? 10);
		bwipOpts.width = sz;
		bwipOpts.height = sz;
	}

	const svgBuffer = await bwipjs.toBuffer(bwipOpts as never).catch(async () => null);
	if (svgBuffer) return svgBuffer.toString('utf-8');

	// Fallback: bwip-js's toSvg API
	type ToSvg = (opts: Record<string, unknown>) => string;
	const toSvg = (bwipjs as unknown as { toSVG?: ToSvg; toSvg?: ToSvg }).toSVG
		?? (bwipjs as unknown as { toSvg?: ToSvg }).toSvg;
	if (!toSvg) throw new Error('bwip-js: no toBuffer/toSVG method available');
	return toSvg({ bcid, text, scale: 2, height: opts?.heightMm ?? 8, includetext: false });
}

/**
 * Render a single tag as a self-contained SVG string. Used both for the
 * preview component and to populate cells of the Avery sheet HTML.
 */
export async function renderTagSvg(ctx: TagRenderContext): Promise<string> {
	const eff = resolveSettings(ctx.settings);
	const dims = await getFormatDimensions(ctx.formatCode ?? eff.preferredFormat);
	return renderTagSvgFromDimensions(dims, ctx);
}

/** Render the preview SVG from already-resolved dimensions (no DB lookup). */
export async function renderTagSvgFromDimensions(
	dims: TagDimensions,
	ctx: TagRenderContext
): Promise<string> {
	const eff = resolveSettings(ctx.settings);
	const widthPx = Math.round(dims.widthInches * 96); // 96 dpi screen
	const heightPx = Math.round(dims.heightInches * 96);

	const header = eff.headerLine?.trim() || ctx.vendorDisplayName;
	const partNumber = ctx.item.partNumber;
	const partName = ctx.item.name ?? '';
	const description = ctx.item.description ?? '';
	const priceText =
		ctx.item.priceCents !== null && ctx.item.priceCents !== undefined
			? `$${(ctx.item.priceCents / 100).toFixed(2)}`
			: '';
	const footer = eff.footerLine?.trim() ?? '';

	// Font sizes scale with format and user preference.
	const baseFs = Math.max(8, heightPx * 0.09);
	const scale = eff.fontScale === 'small' ? 0.85 : eff.fontScale === 'large' ? 1.15 : 1;
	// Per-line scale from the format (default 1.0), applied on top of the base.
	const fsHeader = Math.round(baseFs * 1.0 * scale * lineScale(dims, 'header'));
	const fsBodyDesc = Math.round(baseFs * 0.85 * scale * lineScale(dims, 'description'));
	const fsBodyFooter = Math.round(baseFs * 0.85 * scale * lineScale(dims, 'footer'));
	const fsPrice = Math.round(baseFs * 1.6 * scale * lineScale(dims, 'price'));
	const fsPartNum = Math.round(baseFs * 0.9 * scale * lineScale(dims, 'partNumber'));
	const barcodeRowH = heightPx * 0.32 * lineScale(dims, 'barcode');

	// Barcode renders into a row inside the SVG. Roughly 35% of tag height.
	let barcodeSvg = '';
	if (eff.includeBarcode && partNumber) {
		try {
			const raw = await renderBarcodeSvg(partNumber, {
				symbology: eff.barcodeSymbology as BarcodeSymbology
			});
			// Strip any outer xml decl + outer svg wrapper, keep inner <g>/<rect>
			const inner = raw.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<\/?svg[^>]*>/g, '');
			barcodeSvg = inner;
		} catch (err) {
			barcodeSvg = `<text x="0" y="20" font-size="10" fill="red">barcode error: ${err instanceof Error ? err.message : 'unknown'}</text>`;
		}
	}

	// Compute vertical layout: header / barcode / partNumber / description / price / footer
	const rows: { content: string; height: number }[] = [];
	rows.push({ content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsHeader}" font-weight="700" text-anchor="middle">${escapeXml(header)}</text>`, height: fsHeader * 1.2 });
	if (eff.includeBarcode && barcodeSvg) {
		rows.push({
			content: `<g transform="translate(${widthPx * 0.1}, 0) scale(${(widthPx * 0.8) / 200}, 1)">${barcodeSvg}</g>`,
			height: barcodeRowH
		});
	}
	if (eff.includePartNumber && partNumber) {
		rows.push({
			content: `<text x="${widthPx / 2}" y="0" font-family="monospace" font-size="${fsPartNum}" text-anchor="middle">${escapeXml(partNumber)}</text>`,
			height: fsPartNum * 1.2
		});
	}
	if (eff.includeDescription && (partName || description)) {
		const text = partName || description;
		rows.push({
			content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsBodyDesc}" text-anchor="middle">${escapeXml(truncate(text, 40))}</text>`,
			height: fsBodyDesc * 1.2
		});
	}
	if (eff.includePrice && priceText) {
		rows.push({
			content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsPrice}" font-weight="700" text-anchor="middle">${escapeXml(priceText)}</text>`,
			height: fsPrice * 1.1
		});
	}
	if (footer) {
		rows.push({
			content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsBodyFooter}" text-anchor="middle">${escapeXml(footer)}</text>`,
			height: fsBodyFooter * 1.2
		});
	}

	// Distribute rows top-to-bottom with a small padding
	const padTop = 6;
	const padBottom = 6;
	const totalRowHeight = rows.reduce((s, r) => s + r.height, 0);
	const available = heightPx - padTop - padBottom;
	const gap = rows.length > 1 ? Math.max(0, (available - totalRowHeight) / (rows.length - 1)) : 0;

	let y = padTop;
	const positioned = rows.map((r) => {
		const transform = `translate(0, ${y})`;
		y += r.height + gap;
		return `<g transform="${transform}">${r.content.replace(/y="0"/g, `y="${r.height * 0.8}"`).replace(/translate\(([^,]+),\s*0\)/g, `translate($1, 0)`)}</g>`;
	}).join('');

	// Optional shelf-age month badge — bold 3-letter code in the top-right corner.
	// Sized at ~14% of the tag width so it stays readable on the tiniest formats
	// without crowding the centered vendor header.
	let monthBadge = '';
	const code = ctx.monthCode?.trim().slice(0, 3).toUpperCase();
	if (code) {
		const badgeFs = Math.max(8, Math.round(widthPx * 0.07));
		const padX = Math.max(2, Math.round(widthPx * 0.012));
		const padY = Math.max(1, Math.round(heightPx * 0.02));
		// Width estimate: ~0.62em per char + horizontal padding × 2
		const badgeW = Math.round(code.length * badgeFs * 0.62 + padX * 2);
		const badgeH = Math.round(badgeFs + padY * 2);
		const bx = widthPx - badgeW - 2;
		const by = 2;
		monthBadge = `<g><rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="3" ry="3" fill="black"/><text x="${bx + badgeW / 2}" y="${by + badgeH * 0.75}" font-family="Arial, sans-serif" font-size="${badgeFs}" font-weight="900" fill="white" text-anchor="middle">${escapeXml(code)}</text></g>`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}" style="background:white;border:1px solid #ddd;">${positioned}${monthBadge}</svg>`;
}

export interface AverySheetItem extends TagItem {
	copies?: number; // default 1
	/**
	 * Per-cell overrides used by the staff bulk designer where each row may
	 * belong to a different vendor. When null/undefined, the sheet-level
	 * `vendorDisplayName` + `settings` are used (the single-vendor flow).
	 */
	vendorDisplayName?: string;
	settings?: VendorTagSettings | null;
	monthCode?: string | null;
}

export interface AverySheetOptions {
	formatCode: string;
	startPosition?: number; // 1-based cell index; default 1
	vendorDisplayName: string;
	settings: VendorTagSettings | null;
	items: AverySheetItem[];
	/** Sheet-wide month code; overridden by per-item monthCode when set. */
	monthCode?: string | null;
}

/**
 * Render a print-ready HTML page for an Avery-style sheet of tags. Each cell
 * is positioned absolutely from the format's marginTop/marginLeft + the
 * row/col pitch — same way the labels are die-cut on the actual sheet.
 *
 * The returned HTML is a complete document including a `<style>` block with
 * `@page { size; margin: 0 }`. The vendor's print page loads this in an
 * `<iframe srcdoc>` and calls `.contentWindow.print()` to trigger the
 * browser's print dialog.
 */
export async function renderAverySheetHtml(opts: AverySheetOptions): Promise<string> {
	const [format] = await db
		.select()
		.from(labelFormats)
		.where(eq(labelFormats.code, opts.formatCode))
		.limit(1);

	if (!format || format.layout !== 'sheet') {
		throw new Error(`Unknown or non-sheet label format: ${opts.formatCode}`);
	}
	if (!format.cols || !format.rows || !format.pageWidthInches || !format.pageHeightInches) {
		throw new Error(`Sheet format "${opts.formatCode}" is missing page/cols/rows`);
	}

	const cols = format.cols;
	const rows = format.rows;
	const pageW = parseFloat(format.pageWidthInches);
	const pageH = parseFloat(format.pageHeightInches);
	const labelW = parseFloat(format.labelWidthInches);
	const labelH = parseFloat(format.labelHeightInches);
	const mTop = parseFloat(format.marginTopInches ?? '0.5');
	const mLeft = parseFloat(format.marginLeftInches ?? '0.1875');
	const vPitch = parseFloat(format.verticalPitchInches ?? String(labelH));
	const hPitch = parseFloat(format.horizontalPitchInches ?? String(labelW));

	const totalCells = cols * rows;
	const startPos = Math.max(1, Math.min(opts.startPosition ?? 1, totalCells));

	// Expand items by copies into a flat list of cells. Each cell carries its
	// own vendor/settings/monthCode so a mixed-vendor bulk sheet renders correctly.
	const queue: AverySheetItem[] = [];
	for (const it of opts.items) {
		const copies = Math.max(1, Math.min(it.copies ?? 1, 100));
		for (let i = 0; i < copies; i++) queue.push(it);
	}

	// Render each cell position 1..totalCells. Empty before startPos, item
	// from queue after, blank when queue exhausted.
	const cellsHtml: string[] = [];
	let qIdx = 0;
	for (let pos = 1; pos <= totalCells; pos++) {
		// pos 1 = top-left, fill row-by-row
		const idx = pos - 1;
		const row = Math.floor(idx / cols);
		const col = idx % cols;
		const left = mLeft + col * hPitch;
		const top = mTop + row * vPitch;
		const style = `position:absolute;left:${left}in;top:${top}in;width:${labelW}in;height:${labelH}in;overflow:hidden;`;

		if (pos < startPos || qIdx >= queue.length) {
			cellsHtml.push(`<div class="cell" style="${style}"></div>`);
			continue;
		}
		const item = queue[qIdx++];
		const svg = await renderTagSvg({
			vendorDisplayName: item.vendorDisplayName ?? opts.vendorDisplayName,
			settings: item.settings !== undefined ? item.settings : opts.settings,
			item,
			monthCode: item.monthCode ?? opts.monthCode ?? null
		});
		cellsHtml.push(
			`<div class="cell" style="${style};display:flex;align-items:center;justify-content:center;">${embedSvgFitContent(svg)}</div>`
		);
	}

	// Force the SVG inside each cell to fill its container. The renderer
	// emits a fixed pixel viewBox; setting width/height to 100% scales it
	// nicely while preserving aspect ratio.
	return [
		'<!doctype html>',
		'<html><head><meta charset="utf-8"><title>Print sheet</title>',
		'<style>',
		`@page { size: ${pageW}in ${pageH}in; margin: 0; }`,
		'html, body { margin: 0; padding: 0; width: ' + pageW + 'in; height: ' + pageH + 'in; }',
		'body { position: relative; font-family: Arial, sans-serif; }',
		'.cell svg { width: 100%; height: 100%; border: none !important; background: transparent !important; }',
		'@media screen { body { background: #fafafa; box-shadow: 0 0 12px rgba(0,0,0,0.1); margin: 16px auto; }',
		'  .cell { outline: 1px dashed #ccc; }',
		'}',
		'@media print { .cell { outline: none; } }',
		'</style></head><body>',
		cellsHtml.join(''),
		'</body></html>'
	].join('\n');
}

/**
 * Strip the outer fixed-size SVG wrapper to let the cell's CSS scale it.
 */
function embedSvgFitContent(svg: string): string {
	return svg
		.replace(/(<svg[^>]*?)\s+width="[^"]*"/, '$1')
		.replace(/(<svg[^>]*?)\s+height="[^"]*"/, '$1')
		.replace(/(<svg[^>]*?)\s+style="[^"]*"/, '$1');
}

/**
 * Render a single tag as a ZPL II program for Zebra thermal printers.
 *
 * Layout mirrors `renderTagSvg` (header / barcode / partNumber / desc / price /
 * footer) but uses ZPL field commands. Fonts are Zebra's built-in scalable
 * font 0 (^A0). Coordinates are in dots — `dpi * inches`.
 *
 * Code 128: ^BC. Data Matrix: ^BX. Vendor's `barcodeSymbology` setting picks.
 */
export async function renderZpl(ctx: TagRenderContext): Promise<string> {
	const eff = resolveSettings(ctx.settings);
	const dims = await getFormatDimensions(ctx.formatCode || eff.preferredFormat);
	return renderZplFromDimensions(dims, ctx);
}

/** Per-line font multiplier from the format's shape_dims_json (default 1.0). */
function lineScale(dims: TagDimensions, key: keyof LineScales): number {
	const v = dims.shapeDims?.lineScales?.[key];
	return typeof v === 'number' && v > 0 ? v : 1;
}

/** Render ZPL from already-resolved dimensions (no DB lookup) — lets callers
 *  (e.g. the label designer) preview a format that isn't saved yet. */
export function renderZplFromDimensions(dims: TagDimensions, ctx: TagRenderContext): string {
	const copies = Math.max(1, Math.min(99, Math.floor(ctx.copies ?? 1)));
	const eff = resolveSettings(ctx.settings);
	const dpi = ctx.dpi || eff.zebraDpi || 203;
	const widthDots = Math.round(dims.widthInches * dpi);
	const heightDots = Math.round(dims.heightInches * dpi);

	// Barbell/rat-tail jewelry stock: two printable end pads joined by a thin
	// fold. The generic vertical-stack layout below centers content on the
	// fold; barbell needs a side-by-side, fold-clearing layout instead.
	if (dims.mediaShape === 'barbell') {
		return renderBarbellZpl(ctx, eff, dims, dpi, copies);
	}

	const header = (eff.headerLine?.trim() || ctx.vendorDisplayName).slice(0, 64);
	const partNumber = ctx.item.partNumber;
	const partName = (ctx.item.name ?? '').slice(0, 64);
	const description = (ctx.item.description ?? '').slice(0, 64);
	const priceText =
		ctx.item.priceCents !== null && ctx.item.priceCents !== undefined
			? `$${(ctx.item.priceCents / 100).toFixed(2)}`
			: '';
	const footer = (eff.footerLine?.trim() ?? '').slice(0, 64);

	// Vertical layout — proportional bands, tuned for 2.25"×1.25" 203dpi default
	// but scales to any dimension. Each row knows its own y + font height.
	const padTop = Math.round(heightDots * 0.04);
	const padBottom = Math.round(heightDots * 0.04);
	const usable = heightDots - padTop - padBottom;

	const scale = eff.fontScale === 'small' ? 0.85 : eff.fontScale === 'large' ? 1.15 : 1;
	// Base per-line fonts, then a per-line scale from the format (default 1.0).
	const fH = Math.round(Math.max(18, Math.round(heightDots * 0.14 * scale)) * lineScale(dims, 'header'));
	const fBody = Math.round(Math.max(12, Math.round(heightDots * 0.08 * scale)) * lineScale(dims, 'footer'));
	const fPart = Math.round(Math.max(12, Math.round(heightDots * 0.085 * scale)) * lineScale(dims, 'partNumber'));
	const fDesc = Math.round(Math.max(14, Math.round(heightDots * 0.13 * scale)) * lineScale(dims, 'description'));
	const fPrice = Math.round(Math.max(18, Math.round(heightDots * 0.125 * scale)) * lineScale(dims, 'price'));

	// Optional vertical date down one edge. Skipped on labels too short to hold
	// it (barbell/jewelry stock < 0.8").
	const fDate = Math.max(13, Math.round(heightDots * 0.085 * scale));
	const showDate = !!ctx.edgeDate && dims.heightInches >= 0.8;
	const dateSide = ctx.edgeDateSide ?? 'right';
	const dateCol = showDate ? fDate + 6 : 0; // reserved edge column so text/barcode clear it

	const rows: { kind: 'text' | 'barcode'; height: number; payload: string; opts?: Record<string, number | string> }[] = [];
	rows.push({ kind: 'text', height: fH, payload: header, opts: { font: fH, weight: 1 } });
	if (eff.includeBarcode && partNumber) {
		rows.push({
			kind: 'barcode',
			height: Math.round(Math.round(usable * 0.24) * lineScale(dims, 'barcode')),
			payload: partNumber,
			opts: { sym: eff.barcodeSymbology }
		});
	}
	if (eff.includePartNumber && partNumber) {
		rows.push({ kind: 'text', height: fPart, payload: partNumber, opts: { font: fPart } });
	}
	if (eff.includeDescription && (partName || description)) {
		rows.push({ kind: 'text', height: fDesc, payload: partName || description, opts: { font: fDesc } });
	}
	if (eff.includePrice && priceText) {
		rows.push({ kind: 'text', height: fPrice, payload: priceText, opts: { font: fPrice, weight: 1 } });
	}
	if (footer) {
		rows.push({ kind: 'text', height: fBody, payload: footer, opts: { font: fBody } });
	}

	const totalRowHeight = rows.reduce((s, r) => s + r.height, 0);
	const gap = rows.length > 1 ? Math.max(0, (usable - totalRowHeight) / (rows.length - 1)) : 0;

	let y = padTop;
	const cmds: string[] = [];
	cmds.push('^XA');                  // start of label
	cmds.push(`^PW${widthDots}`);      // print width
	cmds.push(`^LL${heightDots}`);     // label length
	cmds.push('^LH0,0');               // label home
	cmds.push('^CI28');                // UTF-8

	for (const r of rows) {
		const rowY = Math.round(y);
		// Content area is everything left of the reserved date column.
		const blockW = widthDots - dateCol;
		if (r.kind === 'text') {
			const fontH = (r.opts?.font as number) ?? r.height;
			// Truncate to one line that fits, so ^FB never wraps on top of itself.
			const maxChars = Math.max(1, Math.floor(blockW / (fontH * 0.6)));
			const text = r.payload.length > maxChars ? r.payload.slice(0, maxChars) : r.payload;
			cmds.push(`^FO0,${rowY}`);
			cmds.push(`^A0N,${fontH},${fontH}`);
			cmds.push(`^FB${blockW},1,0,C,0`);
			cmds.push(`^FD${zplEscape(text)}^FS`);
		} else {
			const sym = (r.opts?.sym as string) ?? 'code_128';
			if (sym === 'datamatrix') {
				const dims2 = Math.min(blockW * 0.6, r.height);
				const moduleSize = Math.max(3, Math.round(dims2 / 24));
				const x = Math.round((blockW - dims2) / 2);
				cmds.push(`^FO${x},${rowY}`);
				cmds.push(`^BXN,${moduleSize},200`);
				cmds.push(`^FD${zplEscape(r.payload)}^FS`);
			} else {
				// Code 128: size the narrow bar so the symbol fits the content area
				// (so it never runs into the date column), then center it.
				const margin = Math.round(widthDots * 0.04);
				const modules = r.payload.length * 11 + 35; // approx incl. start/stop/check
				// Prefer narrow bar = 2-3 dots (robust scanning); fall back to 1 only
				// when the symbol otherwise won't fit the label width (tiny stock).
				let narrow = Math.floor((blockW - 2 * margin) / modules);
				narrow = Math.max(1, Math.min(3, narrow));
				const bcW = modules * narrow;
				const x = Math.max(margin, Math.round((blockW - bcW) / 2));
				cmds.push('^BY' + narrow);
				cmds.push(`^FO${x},${rowY}`);
				cmds.push(`^BCN,${r.height},N,N,N`);
				cmds.push(`^FD${zplEscape(r.payload)}^FS`);
			}
		}
		y += r.height + gap;
	}

	// Vertical date down the chosen edge (rotated 90°). Reads top→bottom.
	if (showDate) {
		const dateStr = (ctx.edgeDate as string).slice(0, 12);
		const estLen = Math.round(dateStr.length * fDate * 0.62);
		const dy = Math.max(padTop, Math.round((heightDots - estLen) / 2));
		const dx = dateSide === 'left' ? 2 : widthDots - fDate - 2;
		cmds.push(`^FO${dx},${dy}`);
		cmds.push(`^A0R,${fDate},${fDate}`);
		cmds.push(`^FD${zplEscape(dateStr)}^FS`);
	}

	cmds.push(`^PQ${copies}`);                 // print quantity
	cmds.push('^XZ');                  // end of label
	return cmds.join('\n');
}

/**
 * Fallback pad geometry when a barbell format has no `shape_dims_json`:
 * 40% pad / 20% blank neck / 40% pad. Keeps output sane pre-migration.
 */
function defaultBarbellPads(widthInches: number): BarbellShapeDims {
	const padW = widthInches * 0.4;
	return {
		pads: [
			{ role: 'barcode', xIn: 0, widthIn: padW },
			{ role: 'info', xIn: widthInches - padW, widthIn: padW }
		]
	};
}

/**
 * Barbell/rat-tail layout: each pad is rendered independently inside its own
 * x-window so nothing lands on the fold/neck between them. By default the
 * barcode (SKU) goes on one pad and price + description on the other.
 */
function renderBarbellZpl(
	ctx: TagRenderContext,
	eff: ReturnType<typeof resolveSettings>,
	dims: TagDimensions,
	dpi: number,
	copies: number
): string {
	const widthDots = Math.round(dims.widthInches * dpi);
	const heightDots = Math.round(dims.heightInches * dpi);
	const shape =
		dims.shapeDims && dims.shapeDims.pads?.length
			? dims.shapeDims
			: defaultBarbellPads(dims.widthInches);

	const scale = eff.fontScale === 'small' ? 0.85 : eff.fontScale === 'large' ? 1.15 : 1;
	const partNumber = ctx.item.partNumber;
	const priceText =
		ctx.item.priceCents !== null && ctx.item.priceCents !== undefined
			? `$${(ctx.item.priceCents / 100).toFixed(2)}`
			: '';
	const description = ((ctx.item.name || ctx.item.description) ?? '').slice(0, 64);

	const cmds: string[] = ['^XA', `^PW${widthDots}`, `^LL${heightDots}`, '^LH0,0', '^CI28'];

	for (const pad of shape.pads ?? []) {
		const x0 = Math.round(pad.xIn * dpi);
		const padW = Math.round(pad.widthIn * dpi);
		if (pad.role === 'barcode') {
			const barHeightDots = pad.barcodeHeightIn ? Math.round(pad.barcodeHeightIn * dpi) : undefined;
			barbellBarcodePad(cmds, { x0, padW, heightDots, partNumber, eff, scale, barHeightDots });
		} else {
			barbellInfoPad(cmds, { x0, padW, heightDots, priceText, description, eff, scale });
		}
	}

	cmds.push(`^PQ${copies}`);
	cmds.push('^XZ');
	return cmds.join('\n');
}

/** Render the SKU barcode (and optional human-readable SKU) inside one pad. */
function barbellBarcodePad(
	cmds: string[],
	p: {
		x0: number;
		padW: number;
		heightDots: number;
		partNumber: string;
		eff: ReturnType<typeof resolveSettings>;
		scale: number;
		barHeightDots?: number;
	}
): void {
	const { x0, padW, heightDots, partNumber, eff, scale, barHeightDots } = p;
	if (!partNumber) return;
	const margin = Math.max(4, Math.round(padW * 0.06));
	const inner = padW - 2 * margin;
	const showText = eff.includePartNumber;
	const fPart = showText ? Math.max(12, Math.round(heightDots * 0.16 * scale)) : 0;
	const textGap = showText ? 3 : 0;
	// Barcode height: explicit shape_dims_json value (tunable, no rebuild) or
	// ~45% of label height so it doesn't dominate the small pad. Center the
	// barcode (+ SKU text) block vertically.
	const barH = Math.max(20, barHeightDots ?? Math.round(heightDots * 0.45));
	const blockH = barH + (showText ? textGap + fPart : 0);
	const barTop = Math.max(2, Math.round((heightDots - blockH) / 2));

	if (eff.includeBarcode) {
		if (eff.barcodeSymbology === 'datamatrix') {
			const side = Math.min(inner, heightDots - barTop - fPart - textGap);
			const moduleSize = Math.max(3, Math.round(side / 24));
			const dx = x0 + Math.max(margin, Math.round((padW - side) / 2));
			cmds.push(`^FO${dx},${barTop}`);
			cmds.push(`^BXN,${moduleSize},200`);
			cmds.push(`^FD${zplEscape(partNumber)}^FS`);
		} else {
			// Code 128: pick the widest narrow-bar (1-3 dots) that still fits the pad,
			// so the symbol never crosses into the fold.
			const modules = partNumber.length * 11 + 35; // incl. start/stop/check
			const narrow = Math.max(1, Math.min(3, Math.floor(inner / modules)));
			const bcW = modules * narrow;
			const bx = x0 + Math.max(margin, Math.round((padW - bcW) / 2));
			cmds.push('^BY' + narrow);
			cmds.push(`^FO${bx},${barTop}`);
			cmds.push(`^BCN,${barH},N,N,N`);
			cmds.push(`^FD${zplEscape(partNumber)}^FS`);
		}
	}
	if (showText) {
		const ty = eff.includeBarcode ? barTop + barH + textGap : Math.round((heightDots - fPart) / 2);
		cmds.push(`^FO${x0},${ty}`);
		cmds.push(`^A0N,${fPart},${fPart}`);
		cmds.push(`^FB${padW},1,0,C,0`);
		cmds.push(`^FD${zplEscape(partNumber)}^FS`);
	}
}

/** Render price + description, vertically centered, inside one pad. */
function barbellInfoPad(
	cmds: string[],
	p: {
		x0: number;
		padW: number;
		heightDots: number;
		priceText: string;
		description: string;
		eff: ReturnType<typeof resolveSettings>;
		scale: number;
	}
): void {
	const { x0, padW, heightDots, priceText, description, eff, scale } = p;
	const rows: { text: string; f: number; lines: number }[] = [];
	if (eff.includePrice && priceText) {
		rows.push({ text: priceText, f: Math.max(20, Math.round(heightDots * 0.3 * scale)), lines: 1 });
	}
	if (eff.includeDescription && description) {
		rows.push({ text: description, f: Math.max(12, Math.round(heightDots * 0.16 * scale)), lines: 2 });
	}
	if (rows.length === 0) return;

	const lineH = (r: { f: number; lines: number }) => r.f * 1.2 * r.lines;
	const total = rows.reduce((s, r) => s + lineH(r), 0);
	let y = Math.max(2, Math.round((heightDots - total) / 2));
	for (const r of rows) {
		const maxChars = Math.max(1, Math.floor((padW * r.lines) / (r.f * 0.6)));
		const text = r.text.length > maxChars ? r.text.slice(0, maxChars) : r.text;
		cmds.push(`^FO${x0},${Math.round(y)}`);
		cmds.push(`^A0N,${r.f},${r.f}`);
		cmds.push(`^FB${padW},${r.lines},0,C,0`);
		cmds.push(`^FD${zplEscape(text)}^FS`);
		y += lineH(r);
	}
}

/**
 * Escape ZPL field-data special chars. ZPL uses `^` as command prefix and
 * `~` as control prefix; `\` escapes inside ^FH but it's safer to strip.
 */
function zplEscape(s: string): string {
	return s.replace(/[\^~\\]/g, ' ');
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max - 1) + '…';
}
