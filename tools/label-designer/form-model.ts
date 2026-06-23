import type { LabelFormatInput } from '$lib/server/services/label-format-service';
import type {
	TagDimensions,
	TagRenderContext,
	LineScales
} from '$lib/server/services/tag-render-service';

export interface PadInput {
	role: 'barcode' | 'info';
	xIn: number;
	widthIn: number;
	barcodeHeightIn?: number;
}

export interface FormState {
	code: string;
	name: string;
	layout: 'thermal' | 'sheet';
	dpi: number;
	widthIn: number;
	heightIn: number;
	pageWidthIn?: number | null;
	pageHeightIn?: number | null;
	cols?: number | null;
	rows?: number | null;
	marginTopIn?: number | null;
	marginLeftIn?: number | null;
	vPitchIn?: number | null;
	hPitchIn?: number | null;
	mediaShape: 'rectangle' | 'barbell';
	pads?: PadInput[];
	lineScales?: LineScales;
	mediaSensor?: 'gap' | 'mark' | 'continuous' | null;
	manufacturer?: 'zebra' | 'avery' | 'custom';
	partNumber?: string | null;
	fontScale?: 'small' | 'medium' | 'large';
	sample: { vendorName: string; price: string; sku: string; description: string };
}

export function parsePriceToCents(s: string): number | null {
	const t = (s ?? '').replace(/[^0-9.]/g, '').trim();
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Build shape_dims_json from barbell pads and/or per-line scales (null if neither). */
function buildShapeDims(f: FormState): Record<string, unknown> | null {
	const sd: Record<string, unknown> = {};
	if (f.mediaShape === 'barbell' && f.pads?.length) sd.pads = f.pads;
	if (f.lineScales && Object.keys(f.lineScales).length) sd.lineScales = f.lineScales;
	return Object.keys(sd).length ? sd : null;
}

export function formStateToInput(f: FormState): LabelFormatInput {
	const sheet = f.layout === 'sheet';
	return {
		code: f.code,
		name: f.name,
		layout: f.layout,
		labelWidthInches: f.widthIn,
		labelHeightInches: f.heightIn,
		pageWidthInches: sheet ? f.pageWidthIn ?? null : null,
		pageHeightInches: sheet ? f.pageHeightIn ?? null : null,
		cols: sheet ? f.cols ?? null : null,
		rows: sheet ? f.rows ?? null : null,
		marginTopInches: sheet ? f.marginTopIn ?? null : null,
		marginLeftInches: sheet ? f.marginLeftIn ?? null : null,
		verticalPitchInches: sheet ? f.vPitchIn ?? null : null,
		horizontalPitchInches: sheet ? f.hPitchIn ?? null : null,
		mediaShape: f.mediaShape,
		shapeDimsJson: buildShapeDims(f),
		mediaSensor: f.mediaSensor ?? (sheet ? null : 'gap'),
		category: f.layout,
		manufacturer: f.manufacturer ?? 'custom',
		partNumber: f.partNumber ?? null,
		dpi: sheet ? null : f.dpi
	};
}

export function formStateToDimensions(f: FormState): TagDimensions {
	return {
		widthInches: f.widthIn,
		heightInches: f.heightIn,
		cssClass: 'preview',
		mediaShape: f.mediaShape,
		shapeDims: buildShapeDims(f) as TagDimensions['shapeDims']
	};
}

export function formStateToCtx(f: FormState): TagRenderContext {
	return {
		vendorDisplayName: f.sample.vendorName,
		settings: { fontScale: f.fontScale ?? 'medium' } as never,
		item: {
			partNumber: f.sample.sku,
			name: null,
			description: f.sample.description,
			priceCents: parsePriceToCents(f.sample.price)
		},
		copies: 1,
		dpi: f.layout === 'thermal' ? f.dpi : undefined
	} as TagRenderContext;
}
