/**
 * Thin browser-side wrapper around Zebra Browser Print's localhost HTTP API.
 *
 * Browser Print is Zebra's free helper that runs as a tray app on the
 * vendor's machine and exposes:
 *
 *   GET  http://localhost:9100/default       → default printer descriptor
 *   GET  http://localhost:9100/available     → { printer: [...] }
 *   POST http://localhost:9100/write         → { device, data }
 *
 * We don't ship Zebra's BrowserPrint-3.x.js SDK — talking to the HTTP API
 * directly is enough for our use case (send ZPL to default printer). If we
 * later need printer-status polling or USB enumeration, we'll bring the SDK
 * back.
 *
 * Browser Print requires HTTPS to expose the HTTPS port (9101); the HTTP port
 * (9100) works from any origin without CORS preflight because the helper
 * sends `Access-Control-Allow-Origin: *`.
 */

const BASE = 'http://localhost:9100';

export interface ZebraPrinter {
	name: string;
	deviceType?: string;
	connection?: string;
	uid?: string;
}

export class ZebraPrintError extends Error {}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${BASE}${path}`, init);
	} catch (err) {
		throw new ZebraPrintError(
			'Zebra Browser Print is not running. Install it from zebra.com and make sure the tray app is open.'
		);
	}
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new ZebraPrintError(`Browser Print returned ${res.status}: ${body || res.statusText}`);
	}
	const ct = res.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		return (await res.json()) as T;
	}
	return (await res.text()) as unknown as T;
}

/** Returns true if Browser Print is reachable + has a default printer set. */
export async function isAvailable(): Promise<boolean> {
	try {
		const dflt = await req<ZebraPrinter | string>('/default');
		// Some installs return plain text "No default printer" with HTTP 200.
		if (typeof dflt === 'string') return false;
		return Boolean(dflt && dflt.name);
	} catch {
		return false;
	}
}

export async function getDefaultPrinter(): Promise<ZebraPrinter> {
	const r = await req<ZebraPrinter | string>('/default');
	if (typeof r === 'string' || !r?.name) {
		throw new ZebraPrintError('No default Zebra printer is set. Open Browser Print and pick one.');
	}
	return r;
}

export async function listPrinters(): Promise<ZebraPrinter[]> {
	const r = await req<{ printer: ZebraPrinter[] }>('/available');
	return r?.printer ?? [];
}

/**
 * Send a raw ZPL string to the default printer. Throws ZebraPrintError on
 * failure — caller surfaces the message in UI.
 */
export async function printZpl(zpl: string, opts?: { printer?: ZebraPrinter }): Promise<void> {
	const device = opts?.printer ?? (await getDefaultPrinter());
	await req<unknown>('/write', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ device, data: zpl })
	});
}

/**
 * Convenience: fetch ZPL for a part number from our API and print it.
 * Returns the ZPL on success so callers can log if useful.
 */
export async function printPartNumber(partNumber: string): Promise<string> {
	const zr = await fetch(
		`/api/vendor/tag-zpl?partNumber=${encodeURIComponent(partNumber)}`,
		{ credentials: 'same-origin' }
	);
	if (!zr.ok) {
		const msg = await zr.text().catch(() => zr.statusText);
		throw new ZebraPrintError(`Failed to render ZPL: ${msg}`);
	}
	const zpl = await zr.text();
	await printZpl(zpl);
	return zpl;
}

export const BROWSER_PRINT_DOWNLOAD_URL =
	'https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html';
