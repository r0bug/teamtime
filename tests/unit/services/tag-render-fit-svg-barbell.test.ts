import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import {
	renderTagSvgFromDimensions,
	renderZplFromDimensions
} from '$lib/server/services/tag-render-service';

// ── SVG preview ────────────────────────────────────────────────────────────────

/** font-size of the first <text> element whose content matches `marker`. */
function svgFontOf(svg: string, marker: RegExp): number {
	const texts = svg.match(/<text[^>]*>[^<]*<\/text>/g) ?? [];
	for (const t of texts) {
		if (marker.test(t)) {
			const m = t.match(/font-size="(\d+)"/);
			if (m) return parseInt(m[1], 10);
		}
	}
	return -1;
}
const countTexts = (svg: string) => (svg.match(/<text[^>]*>[^<]*<\/text>/g) ?? []).length;

const svgDims = { widthInches: 2.0, heightInches: 1.0, cssClass: 'x' } as any;
const svg = (name: string, partNumber = 'DVR0001', header = 'Acme') =>
	renderTagSvgFromDimensions(svgDims, {
		vendorDisplayName: header,
		settings: null,
		item: { partNumber, name, description: null, priceCents: 999 }
	} as any);

describe('SVG preview smart font resizing', () => {
	it('shrinks the item-name font when the name is too long', async () => {
		// Taller tag so the desc font has real shrink room (on a 1" tag the SVG
		// desc font is already ~7px and a long name just wraps without shrinking).
		const big = { widthInches: 2.0, heightInches: 2.0, cssClass: 'x' } as any;
		const bigSvg = (name: string) =>
			renderTagSvgFromDimensions(big, {
				vendorDisplayName: 'Acme',
				settings: null,
				item: { partNumber: 'DVR0001', name, description: null, priceCents: 999 }
			} as any);
		const fShort = svgFontOf(await bigSvg('Cup'), /Cup/);
		const fLong = svgFontOf(
			await bigSvg('Cast Iron Mechanical Bank Football Vintage Americana Collectible Set'),
			/Cast/
		);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});

	it('wraps a long item name onto a second line (extra <text> element)', async () => {
		const short = countTexts(await svg('Cup'));
		const long = countTexts(await svg('Cast Iron Mechanical Bank Football Vintage Americana Set'));
		expect(long).toBe(short + 1);
	});

	it('shrinks a long vendor/header name', async () => {
		const fShort = svgFontOf(await svg('Cup', 'DVR0001', 'Acme'), /Acme/);
		const fLong = svgFontOf(
			await svg('Cup', 'DVR0001', 'Donn Rasmussons Antiques And Collectibles Emporium'),
			/Donn/
		);
		expect(fLong).toBeLessThan(fShort);
	});
});

// ── Barbell ZPL ──────────────────────────────────────────────────────────────

/** Font height of the TEXT line matching `marker`, skipping barcode rows. */
function fontOf(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (!marker.test(lines[i])) continue;
		for (let j = i; j >= 0; j--) {
			if (/^\^B[CX]N/.test(lines[j])) break;
			const m = lines[j].match(/^\^A0N,(\d+),/);
			if (m) return parseInt(m[1], 10);
		}
	}
	return -1;
}

const barbellDims = {
	widthInches: 2.125,
	heightInches: 0.6125,
	cssClass: 'x',
	mediaShape: 'barbell',
	shapeDims: {
		pads: [
			{ role: 'barcode', xIn: 0, widthIn: 0.85 },
			{ role: 'info', xIn: 1.275, widthIn: 0.85 }
		]
	}
} as any;
const barbell = (name: string, partNumber = 'DVR0001') =>
	renderZplFromDimensions(barbellDims, {
		vendorDisplayName: 'Acme',
		settings: null,
		item: { partNumber, name, description: null, priceCents: 999 }
	} as any);

describe('barbell smart font resizing', () => {
	it('shrinks the description font on the info pad when the name is long', () => {
		const fShort = fontOf(barbell('Cup'), /\^FDCup/);
		const fLong = fontOf(barbell('Sterling Silver Filigree Brooch With Marcasite Stones'), /\^FDSterling/);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});

	it('shrinks the part-number text under the barcode when long', () => {
		const fShort = fontOf(barbell('Cup', 'DVR1'), /\^FDDVR1\^FS/);
		const fLong = fontOf(barbell('Cup', 'DVR62426004999888777'), /\^FDDVR62426004999888777/);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});
});
