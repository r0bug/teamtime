import { describe, it, expect, vi, beforeEach } from 'vitest';

// Barbell jewelry stock: 2.125" x 0.6125" (stored 0.613, decimal(5,3)), with two
// printable end pads joined by a thin fold/neck. shape_dims_json describes the
// pads in inches; the neck is the gap between them and must print blank.
//   @203dpi: width 431 dots, height 124 dots.
//   barcode pad: xIn 0.00 .. 0.85  -> dots 0 .. 173   (neck starts at 173)
//   neck/fold:   0.85 .. 1.275      -> dots 173 .. 259 (blank)
//   info pad:    1.275 .. 2.125     -> dots 259 .. 431
function barbellRow() {
	return {
		code: 'zebra_barbell_2125x0625',
		labelWidthInches: '2.125',
		labelHeightInches: '0.613',
		mediaShape: 'barbell',
		shapeDimsJson: {
			pads: [
				{ role: 'barcode', xIn: 0.0, widthIn: 0.85 },
				{ role: 'info', xIn: 1.275, widthIn: 0.85 }
			]
		} as any
	};
}

// Mutable so individual tests can vary shape_dims_json (default vs tuned).
const hoisted = vi.hoisted(() => ({ row: null as any }));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve([hoisted.row])
				})
			})
		})
	},
	labelFormats: {}
}));

import { renderZpl } from '$lib/server/services/tag-render-service';

beforeEach(() => {
	hoisted.row = barbellRow();
});

const DPI = 203;
const NECK_START = Math.round(0.85 * DPI); // 173
const NECK_END = Math.round(1.275 * DPI); // 259

const baseCtx = {
	vendorDisplayName: 'Sample Vendor',
	formatCode: 'zebra_barbell_2125x0625',
	settings: null,
	item: { partNumber: 'SR51626001', name: null, description: 'Vintage Pyrex', priceCents: 2499 }
} as any;

/** Nearest `^FO<x>,<y>` origin at or before the first line matching `marker`. */
function foBefore(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	const hit = lines.findIndex((l) => marker.test(l));
	if (hit < 0) return -1;
	for (let j = hit; j >= 0; j--) {
		const m = lines[j].match(/^\^FO(\d+),(\d+)/);
		if (m) return parseInt(m[1], 10);
	}
	return -1;
}

/** Nearest `^BY<n>` narrow-bar width at or before the first line matching `marker`. */
function byBefore(zpl: string, marker: RegExp): number {
	const lines = zpl.split('\n');
	const hit = lines.findIndex((l) => marker.test(l));
	for (let j = hit; j >= 0; j--) {
		const m = lines[j].match(/^\^BY(\d+)/);
		if (m) return parseInt(m[1], 10);
	}
	return -1;
}

describe('renderZpl barbell two-pad layout', () => {
	it('confines the barcode to the barcode pad, clearing the fold', async () => {
		const zpl = await renderZpl(baseCtx);
		const bx = foBefore(zpl, /^\^BCN/);
		const narrow = byBefore(zpl, /^\^BCN/);
		const modules = baseCtx.item.partNumber.length * 11 + 35; // Code128 approx
		expect(bx).toBeGreaterThanOrEqual(0);
		// The whole symbol must end before the neck begins — not straddle the fold.
		expect(bx + modules * narrow).toBeLessThanOrEqual(NECK_START);
	});

	it('prints the price on the info pad, right of the fold', async () => {
		const zpl = await renderZpl(baseCtx);
		const px = foBefore(zpl, /\$24\.99/);
		expect(px).toBeGreaterThanOrEqual(NECK_END);
	});

	it('prints the description on the info pad, right of the fold', async () => {
		const zpl = await renderZpl(baseCtx);
		const dx = foBefore(zpl, /\^FDVintage/);
		expect(dx).toBeGreaterThanOrEqual(NECK_END);
	});

	it('keeps the barcode from dominating the pad height', async () => {
		const zpl = await renderZpl(baseCtx);
		const m = zpl.match(/\^BCN,(\d+),/);
		expect(m).not.toBeNull();
		const barH = parseInt(m![1], 10);
		const heightDots = Math.round(0.613 * DPI); // 124
		// Barcode should leave clear vertical breathing room on the pad.
		expect(barH).toBeLessThanOrEqual(Math.round(heightDots * 0.5));
	});

	it('honors an explicit barcodeHeightIn from shape_dims_json (no rebuild to tune)', async () => {
		hoisted.row.shapeDimsJson.pads[0].barcodeHeightIn = 0.2;
		const zpl = await renderZpl(baseCtx);
		const m = zpl.match(/\^BCN,(\d+),/);
		expect(m).not.toBeNull();
		expect(parseInt(m![1], 10)).toBe(Math.round(0.2 * DPI)); // 41
	});

	it('leaves the fold/neck region blank (no field originates inside it)', async () => {
		const zpl = await renderZpl(baseCtx);
		const origins = [...zpl.matchAll(/^\^FO(\d+),/gm)].map((m) => parseInt(m[1], 10));
		const inNeck = origins.filter((x) => x > NECK_START && x < NECK_END);
		expect(inNeck).toEqual([]);
	});

	it('still emits a valid label envelope and copies', async () => {
		const zpl = await renderZpl({ ...baseCtx, copies: 2 });
		expect(zpl.startsWith('^XA')).toBe(true);
		expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
		expect(zpl).toContain('^PQ2');
		expect(zpl).toContain('^LL124'); // 0.613" * 203dpi
	});
});
