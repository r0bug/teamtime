import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, vendorTagSettings, tagFontScaleEnum } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';

const BARCODE_SYMBOLOGIES = ['code_128', 'datamatrix'] as const;

/** Schema defaults, returned when a vendor has no settings row yet. */
function defaultsFor(vendorId: string) {
	return {
		vendorId,
		headerLine: null as string | null,
		footerLine: null as string | null,
		includeDescription: true,
		includePartNumber: true,
		includePrice: true,
		includeBarcode: true,
		barcodeSymbology: 'code_128',
		preferredFormat: 'avery_5160',
		zebraDpi: 203,
		fontScale: 'medium',
		updatedAt: null as Date | null
	};
}

/**
 * GET /api/vendor/tag-settings — the calling vendor's tag template settings,
 * or schema defaults when none have been saved yet.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const [row] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	return json(row ?? defaultsFor(vendor.id));
};

/**
 * PUT /api/vendor/tag-settings — upsert a partial of the tag settings. Unknown
 * keys are ignored; known keys are type-validated. Returns the updated row.
 */
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	let body: Record<string, unknown> = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const patch: Record<string, unknown> = {};

	for (const key of ['headerLine', 'footerLine'] as const) {
		if (key in body) {
			const v = body[key];
			if (v !== null && typeof v !== 'string') {
				return json({ error: `${key} must be a string or null` }, { status: 400 });
			}
			patch[key] = v;
		}
	}

	for (const key of ['includeDescription', 'includePartNumber', 'includePrice', 'includeBarcode'] as const) {
		if (key in body) {
			if (typeof body[key] !== 'boolean') {
				return json({ error: `${key} must be a boolean` }, { status: 400 });
			}
			patch[key] = body[key];
		}
	}

	if ('barcodeSymbology' in body) {
		if (!BARCODE_SYMBOLOGIES.includes(body.barcodeSymbology as (typeof BARCODE_SYMBOLOGIES)[number])) {
			return json({ error: "barcodeSymbology must be 'code_128' or 'datamatrix'" }, { status: 400 });
		}
		patch.barcodeSymbology = body.barcodeSymbology;
	}

	if ('fontScale' in body) {
		if (!tagFontScaleEnum.enumValues.includes(body.fontScale as (typeof tagFontScaleEnum.enumValues)[number])) {
			return json(
				{ error: `fontScale must be one of ${tagFontScaleEnum.enumValues.join(', ')}` },
				{ status: 400 }
			);
		}
		patch.fontScale = body.fontScale;
	}

	if ('preferredFormat' in body) {
		if (typeof body.preferredFormat !== 'string') {
			return json({ error: 'preferredFormat must be a string' }, { status: 400 });
		}
		patch.preferredFormat = body.preferredFormat;
	}

	if ('zebraDpi' in body) {
		const dpi = typeof body.zebraDpi === 'number' ? body.zebraDpi : parseInt(String(body.zebraDpi), 10);
		if (!Number.isInteger(dpi)) {
			return json({ error: 'zebraDpi must be an integer' }, { status: 400 });
		}
		patch.zebraDpi = dpi;
	}

	const [row] = await db
		.insert(vendorTagSettings)
		.values({ vendorId: vendor.id, ...patch })
		.onConflictDoUpdate({
			target: vendorTagSettings.vendorId,
			set: { ...patch, updatedAt: new Date() }
		})
		.returning();

	return json(row);
};
