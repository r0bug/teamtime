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
	sample: {
		vendorName: string;
		price: string;
		sku: string;
		description: string;
		/** Preview-only: the vertical tag date the real print path always adds
		 *  down an edge (renderZpl shows it on labels >= 0.8" tall). */
		edgeDate?: string;
		edgeDateSide?: 'left' | 'right' | 'none';
	};
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

/** Reverse of formStateToInput: map a saved DB row (from listFormats) back into
 *  a FormState so the UI can load an existing format for editing. Numeric columns
 *  are stored as strings, so they're parsed here. Sample data is preview-only and
 *  not stored, so it gets neutral placeholders. */
export function formatRowToState(row: Record<string, unknown>): FormState {
	const n = (v: unknown): number | null => {
		if (v == null || v === '') return null;
		const x = typeof v === 'number' ? v : parseFloat(String(v));
		return Number.isFinite(x) ? x : null;
	};
	const sd = (row.shapeDimsJson ?? {}) as { pads?: PadInput[]; lineScales?: LineScales };
	const shape = row.mediaShape === 'barbell' ? 'barbell' : 'rectangle';
	return {
		code: String(row.code ?? ''),
		name: String(row.name ?? ''),
		layout: row.layout === 'sheet' ? 'sheet' : 'thermal',
		dpi: n(row.dpi) ?? 203,
		widthIn: n(row.labelWidthInches) ?? 0,
		heightIn: n(row.labelHeightInches) ?? 0,
		pageWidthIn: n(row.pageWidthInches),
		pageHeightIn: n(row.pageHeightInches),
		cols: n(row.cols),
		rows: n(row.rows),
		marginTopIn: n(row.marginTopInches),
		marginLeftIn: n(row.marginLeftInches),
		vPitchIn: n(row.verticalPitchInches),
		hPitchIn: n(row.horizontalPitchInches),
		mediaShape: shape,
		pads: shape === 'barbell' && Array.isArray(sd.pads) ? sd.pads : [],
		lineScales: sd.lineScales ?? {},
		mediaSensor: (row.mediaSensor as FormState['mediaSensor']) ?? null,
		manufacturer: (row.manufacturer as FormState['manufacturer']) ?? 'custom',
		partNumber: (row.partNumber as string | null) ?? null,
		fontScale: 'medium',
		sample: { vendorName: 'Yakima Finds', price: '$9.99', sku: 'SR62301001', description: 'Vintage Pyrex bowl' }
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
		dpi: f.layout === 'thermal' ? f.dpi : undefined,
		// Mirror the real print path, which always stamps a vertical tag date down
		// an edge — so the preview reserves the same column and shows it.
		edgeDate:
			f.sample.edgeDateSide !== 'none' && f.sample.edgeDate ? f.sample.edgeDate : undefined,
		edgeDateSide: f.sample.edgeDateSide === 'left' ? 'left' : 'right'
	} as TagRenderContext;
}
