import { describe, it, expect } from 'vitest';
import { buildAlignmentBorderZpl } from '../../../tools/label-designer/zpl-border';

describe('buildAlignmentBorderZpl', () => {
	it('frames the full printable area with center lines and dims', () => {
		const zpl = buildAlignmentBorderZpl({ widthInches: 1.5, heightInches: 1.0, dpi: 203 });
		expect(zpl).toContain('^PW305'); // round(1.5*203)
		expect(zpl).toContain('^LL203');
		expect(zpl).toContain('^FO0,0^GB305,203,2^FS'); // outer border
		expect(zpl).toContain('^FO153,0^GB1,203,1^FS'); // vertical center: round(305/2)
		expect(zpl).toContain('^FD305x203@203^FS'); // dims label
		expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
	});

	it('draws a box per barbell pad when pads given', () => {
		const zpl = buildAlignmentBorderZpl({
			widthInches: 2.125,
			heightInches: 0.6125,
			dpi: 203,
			pads: [
				{ xIn: 0, widthIn: 0.85 },
				{ xIn: 1.275, widthIn: 0.85 }
			]
		});
		expect(zpl).toContain('^FO0,0^GB173,124,1^FS'); // pad 1 (round(0.85*203)=173, round(0.6125*203)=124)
		expect(zpl).toContain('^FO259,0^GB173,124,1^FS'); // pad 2 (round(1.275*203)=259)
	});
});
