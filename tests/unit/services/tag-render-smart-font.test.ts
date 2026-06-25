import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import { renderZplFromDimensions } from '$lib/server/services/tag-render-service';

/** Font height (^A0N,<h>) of the TEXT line whose ^FD payload matches `marker`.
 *  Skips barcode rows (whose ^FD payload can equal the part number) by bailing
 *  if a ^BCN/^BXN is hit before an ^A0N when walking back. */
function fontOf(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (!marker.test(lines[i])) continue;
		for (let j = i; j >= 0; j--) {
			if (/^\^B[CX]N/.test(lines[j])) break; // barcode row — not this match
			const m = lines[j].match(/^\^A0N,(\d+),/);
			if (m) return parseInt(m[1], 10);
		}
	}
	return -1;
}

/** maxLines field of the ^FB that immediately precedes the ^FD matching `marker`. */
function fbLinesOf(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	const hit = lines.findIndex((l) => marker.test(l));
	if (hit < 0) return -1;
	for (let j = hit; j >= 0; j--) {
		const m = lines[j].match(/^\^FB\d+,(\d+),/);
		if (m) return parseInt(m[1], 10);
	}
	return -1;
}

const dims = { widthInches: 2.0, heightInches: 1.0, cssClass: 'x' } as any;
const render = (name: string, partNumber = 'DVR0001', header = 'Acme') =>
	renderZplFromDimensions(dims, {
		vendorDisplayName: header,
		settings: null,
		item: { partNumber, name, description: null, priceCents: 999 }
	} as any);

describe('smart font resizing — item name', () => {
	it('shrinks the name font when the name is too long to fit at the static size', () => {
		const fShort = fontOf(render('Cup'), /\^FDCup/);
		const fLong = fontOf(
			render('Cast Iron Mechanical Bank Football Vintage Americana Collectible Set'),
			/\^FDCast/
		);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});

	it('wraps the name onto two lines (^FB maxLines = 2)', () => {
		const zpl = render('Cast Iron Mechanical Bank Football Vintage Americana Collectible Set');
		expect(fbLinesOf(zpl, /\^FDCast/)).toBe(2);
	});

	it('never shrinks below the 203dpi floor and ellipsizes the overflow', () => {
		// Floor + ellipsis is a small-label last resort: a name that can't fit two
		// lines even at the floor. (On a wide label the name just shrinks/wraps.)
		const narrow = { widthInches: 0.8, heightInches: 1.0, cssClass: 'x' } as any;
		const zpl = renderZplFromDimensions(narrow, {
			vendorDisplayName: 'Acme',
			settings: null,
			item: { partNumber: 'DVR0001', name: 'A'.repeat(80), description: null, priceCents: 999 }
		} as any);
		const font = fontOf(zpl, /\^FDAAAA/);
		expect(font).toBe(12); // 203dpi readability floor (12 dots ≈ 4.3pt)
		const fd = zpl.split('\n').find((l) => /^\^FDAAAA/.test(l)) ?? '';
		expect(fd).toContain('…');
	});

	it('leaves a short name at the full static font (no shrink)', () => {
		// 'Cup' must equal the un-shrunk descriptor size for this label
		const f = fontOf(render('Cup'), /\^FDCup/);
		expect(f).toBe(26); // round(203 * 0.13) on a 1.0" label
	});
});

describe('smart font resizing — vendor/header name', () => {
	it('shrinks a long vendor name to fit one line', () => {
		const fShort = fontOf(render('Cup', 'DVR0001', 'Acme'), /\^FDAcme/);
		const fLong = fontOf(
			render('Cup', 'DVR0001', 'Donn Rasmussons Antiques And Collectibles Emporium'),
			/\^FDDonn/
		);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});
});

describe('smart font resizing — part number', () => {
	// Narrow label so the desired part-number font overflows and must shrink.
	const narrow = { widthInches: 0.8, heightInches: 1.0, cssClass: 'x' } as any;
	const renderPart = (partNumber: string) =>
		renderZplFromDimensions(narrow, {
			vendorDisplayName: 'Acme',
			settings: null,
			item: { partNumber, name: 'Cup', description: null, priceCents: 999 }
		} as any);

	it('shrinks a long part number to fit one line', () => {
		const fShort = fontOf(renderPart('DVR1'), /\^FDDVR1\^FS/);
		const fLong = fontOf(renderPart('DVR62426004999888777'), /\^FDDVR62426004999888777/);
		expect(fShort).toBeGreaterThan(0);
		expect(fLong).toBeGreaterThan(0);
		expect(fLong).toBeLessThan(fShort);
	});
});

describe('smart font resizing — price is unaffected', () => {
	it('keeps the price font constant regardless of name length', () => {
		const fA = fontOf(render('Cup'), /\^FD\$9\.99/);
		const fB = fontOf(render('A'.repeat(120)), /\^FD\$9\.99/);
		expect(fA).toBe(fB);
		expect(fA).toBeGreaterThan(0);
	});
});

describe('Code 128 automatic mode (subset C packing)', () => {
	it('emits ^BC in automatic mode so digit runs use subset C', () => {
		const zpl = render('Cup');
		expect(/\^BCN,\d+,N,N,N,A/.test(zpl)).toBe(true);
	});
});
