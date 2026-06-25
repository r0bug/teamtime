import { describe, it, expect } from 'vitest';
import {
	formStateToInput,
	formStateToDimensions,
	formatRowToState,
	parsePriceToCents
} from '../../../tools/label-designer/form-model';

const base = {
	code: 'zebra_gk420t_15x1',
	name: 'Zebra 1.5 x 1',
	layout: 'thermal',
	dpi: 203,
	widthIn: 1.5,
	heightIn: 1.0,
	mediaShape: 'rectangle',
	mediaSensor: 'gap',
	manufacturer: 'zebra',
	partNumber: null,
	sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'Widget' }
} as any;

describe('form-model', () => {
	it('maps a rectangle thermal form to LabelFormatInput', () => {
		const input = formStateToInput(base);
		expect(input).toMatchObject({
			code: 'zebra_gk420t_15x1',
			layout: 'thermal',
			category: 'thermal',
			labelWidthInches: 1.5,
			labelHeightInches: 1.0,
			mediaShape: 'rectangle',
			dpi: 203,
			shapeDimsJson: null
		});
	});

	it('maps barbell pads into shapeDimsJson', () => {
		const f = {
			...base,
			mediaShape: 'barbell',
			pads: [
				{ role: 'barcode', xIn: 0, widthIn: 0.85, barcodeHeightIn: 0.28 },
				{ role: 'info', xIn: 1.275, widthIn: 0.85 }
			]
		};
		const input = formStateToInput(f);
		expect(input.shapeDimsJson).toEqual({ pads: f.pads });
		expect(input.mediaShape).toBe('barbell');
	});

	it('builds preview dimensions', () => {
		const dims = formStateToDimensions(base);
		expect(dims).toMatchObject({ widthInches: 1.5, heightInches: 1.0, mediaShape: 'rectangle' });
	});

	it('round-trips lineScales into shapeDimsJson (rectangle) and shapeDims', () => {
		const f = { ...base, lineScales: { price: 1.5, footer: 0.8 } };
		expect(formStateToInput(f).shapeDimsJson).toEqual({ lineScales: { price: 1.5, footer: 0.8 } });
		expect(formStateToDimensions(f).shapeDims).toEqual({ lineScales: { price: 1.5, footer: 0.8 } });
	});

	it('merges pads and lineScales for barbell', () => {
		const f = {
			...base,
			mediaShape: 'barbell',
			pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85 }],
			lineScales: { price: 2 }
		};
		expect(formStateToInput(f).shapeDimsJson).toEqual({
			pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85 }],
			lineScales: { price: 2 }
		});
	});

	it('parses prices to cents', () => {
		expect(parsePriceToCents('$9.99')).toBe(999);
		expect(parsePriceToCents('12')).toBe(1200);
		expect(parsePriceToCents('')).toBeNull();
	});
});

describe('formatRowToState (load existing format into the form)', () => {
	it('maps a thermal DB row (string numerics) back into form state', () => {
		const row = {
			code: 'zebra_2x1',
			name: 'Zebra 2x1',
			layout: 'thermal',
			labelWidthInches: '2.000',
			labelHeightInches: '1.000',
			dpi: 203,
			mediaShape: 'rectangle',
			mediaSensor: 'gap',
			manufacturer: 'zebra',
			partNumber: null,
			shapeDimsJson: { lineScales: { price: 1.5 } }
		} as any;
		const s = formatRowToState(row);
		expect(s.code).toBe('zebra_2x1');
		expect(s.widthIn).toBe(2);
		expect(s.heightIn).toBe(1);
		expect(s.dpi).toBe(203);
		expect(s.layout).toBe('thermal');
		expect(s.mediaShape).toBe('rectangle');
		expect(s.lineScales).toEqual({ price: 1.5 });
	});

	it('restores barbell pads from shapeDimsJson', () => {
		const row = {
			code: 'bb',
			name: 'BB',
			layout: 'thermal',
			labelWidthInches: '2.125',
			labelHeightInches: '0.6125',
			dpi: 203,
			mediaShape: 'barbell',
			shapeDimsJson: { pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85 }] }
		} as any;
		const s = formatRowToState(row);
		expect(s.mediaShape).toBe('barbell');
		expect(s.pads).toEqual([{ role: 'barcode', xIn: 0, widthIn: 0.85 }]);
	});

	it('round-trips a form through input → row-shape → state', () => {
		const f = { ...base, lineScales: { description: 1.25 } };
		const input = formStateToInput(f);
		// Simulate the DB row: numerics stored as strings (as toRow does).
		const row = {
			...input,
			labelWidthInches: String(input.labelWidthInches),
			labelHeightInches: String(input.labelHeightInches)
		} as any;
		const s = formatRowToState(row);
		expect(s.code).toBe(f.code);
		expect(s.widthIn).toBe(f.widthIn);
		expect(s.heightIn).toBe(f.heightIn);
		expect(s.lineScales).toEqual({ description: 1.25 });
	});
});
