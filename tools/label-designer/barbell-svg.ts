import { renderBarcodeSvg } from '$lib/server/services/tag-render-service';
import type { FormState } from './form-model';
import { parsePriceToCents } from './form-model';

const PX = 96; // screen px per inch

/** A preview SVG mirroring the ZPL barbell layout: label outline, pad/neck
 *  boxes, a barcode in the barcode pad, and price + description in the info pad.
 *  True print fidelity comes from the test print; this is for fast iteration. */
export async function renderBarbellPreviewSvg(f: FormState): Promise<string> {
	const w = f.widthIn * PX;
	const h = f.heightIn * PX;
	const pads = f.pads ?? [];
	const parts: string[] = [];
	parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="white" stroke="#bbb"/>`);
	for (const p of pads) {
		const px = p.xIn * PX;
		const pw = p.widthIn * PX;
		parts.push(
			`<rect x="${px}" y="0" width="${pw}" height="${h}" fill="none" stroke="#3b82f6" stroke-dasharray="3 2"/>`
		);
	}
	const barcodePad = pads.find((p) => p.role === 'barcode');
	const infoPad = pads.find((p) => p.role === 'info');
	if (barcodePad) {
		const bc = await renderBarcodeSvg(f.sample.sku, { heightMm: 8 });
		const bx = barcodePad.xIn * PX + 6;
		const bw = barcodePad.widthIn * PX - 12;
		parts.push(
			`<g transform="translate(${bx}, ${h * 0.2})"><svg width="${bw}" height="${h * 0.45}" viewBox="0 0 200 80" preserveAspectRatio="none">${stripSvgWrapper(bc)}</svg></g>`
		);
		parts.push(
			`<text x="${barcodePad.xIn * PX + (barcodePad.widthIn * PX) / 2}" y="${h * 0.9}" font-size="9" text-anchor="middle" font-family="monospace">${escapeXml(f.sample.sku)}</text>`
		);
	}
	if (infoPad) {
		const cx = infoPad.xIn * PX + (infoPad.widthIn * PX) / 2;
		const cents = parsePriceToCents(f.sample.price);
		if (cents !== null) {
			parts.push(
				`<text x="${cx}" y="${h * 0.45}" font-size="16" font-weight="700" text-anchor="middle">$${(cents / 100).toFixed(2)}</text>`
			);
		}
		parts.push(
			`<text x="${cx}" y="${h * 0.75}" font-size="10" text-anchor="middle">${escapeXml(f.sample.description)}</text>`
		);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}

function stripSvgWrapper(svg: string): string {
	return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
function escapeXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
