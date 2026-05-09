import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { renderTagSvg } from '$lib/server/services/tag-render-service';
import type { VendorTagSettings } from '$lib/server/db/schema';

/**
 * POST /api/admin/tag-preview — render a single tag SVG with the supplied
 * settings + sample item. Used by the tag designer's live preview.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = (await request.json()) as {
		vendorDisplayName?: string;
		settings?: Partial<VendorTagSettings>;
		item?: {
			partNumber?: string;
			name?: string;
			description?: string;
			priceCents?: number;
		};
	};

	const settings: VendorTagSettings = {
		vendorId: '00000000-0000-0000-0000-000000000000',
		headerLine: body.settings?.headerLine ?? null,
		footerLine: body.settings?.footerLine ?? null,
		includeDescription: body.settings?.includeDescription ?? true,
		includePartNumber: body.settings?.includePartNumber ?? true,
		includePrice: body.settings?.includePrice ?? true,
		includeBarcode: body.settings?.includeBarcode ?? true,
		barcodeSymbology: body.settings?.barcodeSymbology ?? 'code_128',
		preferredFormat: body.settings?.preferredFormat ?? 'avery_5160',
		zebraDpi: body.settings?.zebraDpi ?? 203,
		fontScale: body.settings?.fontScale ?? 'medium',
		updatedAt: new Date()
	};

	const svg = await renderTagSvg({
		vendorDisplayName: body.vendorDisplayName ?? 'My Booth',
		settings,
		item: {
			partNumber: body.item?.partNumber ?? 'XX00042',
			name: body.item?.name ?? 'Vintage Pyrex Bowl',
			description: body.item?.description ?? '',
			priceCents: body.item?.priceCents ?? 2499
		}
	});

	return json({ svg });
};
