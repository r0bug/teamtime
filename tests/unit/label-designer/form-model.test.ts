import { describe, it, expect } from 'vitest';
import {
	formStateToInput,
	formStateToDimensions,
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
