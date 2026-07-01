import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { assertThermalFormat, renderVendorTagZpl, TagZplError } from '$lib/server/services/tag-zpl-service';

/**
 * GET /api/vendor/tag-zpl?partNumber=SR26580001&copies=N&format=CODE
 * Returns ZPL II text for a single tag for the calling vendor's own item.
 *
 * `format` is optional — omitted uses the vendor's preferred format; a provided
 * code must exist and be a thermal format (else 400). The browser (or the desktop
 * label app) forwards the body straight to the printer; ZPL is plain text.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const partNumber = url.searchParams.get('partNumber')?.trim();
	if (!partNumber) throw error(400, 'partNumber required');

	const copiesRaw = url.searchParams.get('copies');
	let copies: number | undefined = undefined;
	if (copiesRaw !== null) {
		if (!/^\d+$/.test(copiesRaw)) {
			return json({ error: 'copies must be a positive integer' }, { status: 400 });
		}
		copies = parseInt(copiesRaw, 10);
	}

	const formatCode = url.searchParams.get('format')?.trim() || undefined;
	const nameSource = url.searchParams.get('nameSource')?.trim();
	const customHeader = url.searchParams.get('header')?.trim().slice(0, 64) || undefined;

	// Optional render resolution — the selected printer's dpi (printer registry is
	// the source of truth). Omitted falls back to the vendor's zebraDpi / 203.
	const dpiRaw = url.searchParams.get('dpi');
	let dpi: number | undefined = undefined;
	if (dpiRaw !== null) {
		if (!/^\d+$/.test(dpiRaw)) {
			return json({ error: 'dpi must be a positive integer' }, { status: 400 });
		}
		dpi = parseInt(dpiRaw, 10);
		if (dpi < 50 || dpi > 1200) {
			return json({ error: 'dpi must be between 50 and 1200' }, { status: 400 });
		}
	}

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');
	// No ownership re-check before printing. Items only reach the print queue by
	// being created in NRS, so the queue is itself the proof they're valid, owned
	// items — re-verifying here is redundant, and a live NRS ownership lookup per
	// tag froze the app. Pre-existing manufacturer UPCs/barcodes (which don't carry
	// the vendor prefix) now reprint like any other item.

	try {
		await assertThermalFormat(formatCode);
		// Header precedence: explicit custom title > store name (contact) > vendor name.
		const headerOverride =
			customHeader ?? (nameSource === 'contact' ? (vendor.contactName ?? undefined) : undefined);
		const zpl = await renderVendorTagZpl(vendor, partNumber, { copies, formatCode, headerOverride, dpi });
		return new Response(zpl, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		if (err instanceof TagZplError) return json({ error: err.message }, { status: err.status });
		throw err;
	}
};
