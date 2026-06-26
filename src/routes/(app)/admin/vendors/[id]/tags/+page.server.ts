import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, vendors, vendorTagSettings } from '$lib/server/db';
import { renderTagSvg } from '$lib/server/services/tag-render-service';
import { listFormats } from '$lib/server/services/label-format-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/dashboard');

	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, params.id)).limit(1);
	if (!vendor) throw error(404, 'Vendor not found');

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, params.id))
		.limit(1);

	// Build a sample item for the live preview
	const samplePartNumber = `${vendor.inventoryCodePrefix ?? 'XX'}00042`;
	const initialPreviewSvg = await renderTagSvg({
		vendorDisplayName: vendor.displayName,
		settings: settings ?? null,
		item: {
			partNumber: samplePartNumber,
			name: 'Vintage Pyrex Bowl',
			description: 'Cinderella mixing bowl, mid-century',
			priceCents: 2499
		}
	});

	const formats = await listFormats({ includeInactive: false });

	return {
		vendor,
		settings: settings ?? null,
		samplePartNumber,
		initialPreviewSvg,
		formats
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const headerLine = ((data.get('headerLine') as string) ?? '').trim() || null;
		const footerLine = ((data.get('footerLine') as string) ?? '').trim() || null;
		const includeDescription = data.get('includeDescription') === 'on';
		const includePartNumber = data.get('includePartNumber') === 'on';
		const includePrice = data.get('includePrice') === 'on';
		const includeBarcode = data.get('includeBarcode') === 'on';
		const barcodeSymbologyRaw = (data.get('barcodeSymbology') as string) || 'code_128';
		const barcodeSymbology = barcodeSymbologyRaw === 'datamatrix' ? 'datamatrix' : 'code_128';
		const preferredFormat = (data.get('preferredFormat') as string) || 'avery_5160';
		const fontScale = (data.get('fontScale') as string) || 'medium';
		const zebraDpiRaw = (data.get('zebraDpi') as string) || '203';
		const zebraDpi = parseInt(zebraDpiRaw, 10) || 203;

		const formats = await listFormats({ includeInactive: false });
		if (!formats.some((f) => f.code === preferredFormat)) {
			return fail(400, { error: `Format "${preferredFormat}" is not configured. Add it under Label Formats first.` });
		}
		const validScales = ['small', 'medium', 'large'];
		if (!validScales.includes(fontScale)) return fail(400, { error: 'Invalid font scale' });

		await db
			.insert(vendorTagSettings)
			.values({
				vendorId: params.id,
				headerLine,
				footerLine,
				includeDescription,
				includePartNumber,
				includePrice,
				includeBarcode,
				barcodeSymbology,
				preferredFormat,
				zebraDpi,
				fontScale: fontScale as 'small' | 'medium' | 'large'
			})
			.onConflictDoUpdate({
				target: vendorTagSettings.vendorId,
				set: {
					headerLine,
					footerLine,
					includeDescription,
					includePartNumber,
					includePrice,
					includeBarcode,
					preferredFormat,
					zebraDpi,
					fontScale: fontScale as 'small' | 'medium' | 'large',
					updatedAt: new Date()
				}
			});

		return { success: true };
	}
};
