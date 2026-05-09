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
}

export interface TagDimensions {
	widthInches: number;
	heightInches: number;
	cssClass: string;
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
			cssClass: `tag-${row.code.replace(/_/g, '-')}`
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
	const dims = await getFormatDimensions(eff.preferredFormat);
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
	const fsHeader = Math.round(baseFs * 1.0 * scale);
	const fsBody = Math.round(baseFs * 0.85 * scale);
	const fsPrice = Math.round(baseFs * 1.6 * scale);
	const fsPartNum = Math.round(baseFs * 0.9 * scale);

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
			height: heightPx * 0.32
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
			content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsBody}" text-anchor="middle">${escapeXml(truncate(text, 40))}</text>`,
			height: fsBody * 1.2
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
			content: `<text x="${widthPx / 2}" y="0" font-family="Arial, sans-serif" font-size="${fsBody}" text-anchor="middle">${escapeXml(footer)}</text>`,
			height: fsBody * 1.2
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

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}" style="background:white;border:1px solid #ddd;">${positioned}</svg>`;
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
	const dims = await getFormatDimensions(eff.preferredFormat);
	const dpi = eff.zebraDpi || 203;
	const widthDots = Math.round(dims.widthInches * dpi);
	const heightDots = Math.round(dims.heightInches * dpi);

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
	const fH = Math.max(14, Math.round(heightDots * 0.10 * scale));      // header font height
	const fBody = Math.max(12, Math.round(heightDots * 0.08 * scale));   // desc / footer
	const fPart = Math.max(12, Math.round(heightDots * 0.085 * scale));  // part #
	const fPrice = Math.max(20, Math.round(heightDots * 0.16 * scale));  // price

	const rows: { kind: 'text' | 'barcode'; height: number; payload: string; opts?: Record<string, number | string> }[] = [];
	rows.push({ kind: 'text', height: fH, payload: header, opts: { font: fH, weight: 1 } });
	if (eff.includeBarcode && partNumber) {
		rows.push({
			kind: 'barcode',
			height: Math.round(usable * 0.32),
			payload: partNumber,
			opts: { sym: eff.barcodeSymbology }
		});
	}
	if (eff.includePartNumber && partNumber) {
		rows.push({ kind: 'text', height: fPart, payload: partNumber, opts: { font: fPart } });
	}
	if (eff.includeDescription && (partName || description)) {
		rows.push({ kind: 'text', height: fBody, payload: partName || description, opts: { font: fBody } });
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
		if (r.kind === 'text') {
			const fontH = (r.opts?.font as number) ?? r.height;
			// Center horizontally: ^FB block of full width with center alignment
			cmds.push(`^FO0,${rowY}`);
			cmds.push(`^A0N,${fontH},${fontH}`);
			cmds.push(`^FB${widthDots},1,0,C,0`);
			cmds.push(`^FD${zplEscape(r.payload)}^FS`);
		} else {
			const sym = (r.opts?.sym as string) ?? 'code_128';
			if (sym === 'datamatrix') {
				const dims2 = Math.min(widthDots * 0.6, r.height);
				const moduleSize = Math.max(3, Math.round(dims2 / 24));
				const x = Math.round((widthDots - dims2) / 2);
				cmds.push(`^FO${x},${rowY}`);
				cmds.push(`^BXN,${moduleSize},200`);
				cmds.push(`^FD${zplEscape(r.payload)}^FS`);
			} else {
				// Code 128: width-by-narrow-bar dots, height in dots.
				const narrow = 2;
				cmds.push('^BY' + narrow);
				const x = Math.round(widthDots * 0.05);
				const bcWidth = widthDots - x * 2;
				cmds.push(`^FO${x},${rowY}`);
				cmds.push(`^BCN,${r.height},N,N,N`);
				cmds.push(`^FD${zplEscape(r.payload)}^FS`);
				void bcWidth; // ZPL Code 128 picks its own width from ^BY + data length
			}
		}
		y += r.height + gap;
	}

	cmds.push('^PQ1');                 // print quantity
	cmds.push('^XZ');                  // end of label
	return cmds.join('\n');
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
