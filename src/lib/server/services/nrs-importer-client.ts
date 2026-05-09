/**
 * NRS Importer client — drives the web UI's CSV import via session-cookie auth,
 * since NRS hasn't yet exposed an `invstock/save` API.
 *
 * Flow:
 *   1. login()             — POST credentials to / (form), capture PHPSESSID
 *   2. uploadFile()        — POST multipart to /attachments/upload.php, get { id }
 *   3. submitImport()      — POST form to /import/type/ImportInv with importFile_id
 *
 * Session-bound. Run sequentially, not in parallel, since cookies are shared.
 *
 * Brittle by nature — if NRS redesigns the importer page, this breaks. Plan
 * is to retire it once they ship invstock/save.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:nrs-importer');

const NRS_BASE = 'https://www.nrsaccounting.com';
const CREDS_PATH = path.resolve(process.cwd(), 'scraper-imports', 'nrscreds.secret');

/** Read NRS web-UI credentials from the existing scraper secret file. */
function loadCreds(): { user: string; pw: string } {
	if (!fs.existsSync(CREDS_PATH)) {
		throw new Error(`NRS web-UI creds file not found: ${CREDS_PATH}`);
	}
	const raw = fs.readFileSync(CREDS_PATH, 'utf-8').trim();
	const colon = raw.indexOf(':');
	if (colon < 0) throw new Error('NRS creds file must be email:password');
	return { user: raw.slice(0, colon).trim(), pw: raw.slice(colon + 1).trim() };
}

export class NrsImporterClient {
	private cookies = new Map<string, string>();

	private cookieHeader(): string {
		return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
	}

	private absorbCookies(resp: Response): void {
		// undici returns multiple Set-Cookie via getSetCookie() in newer Node;
		// fall back to single header.
		const setCookies = (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
		const list = setCookies && setCookies.length ? setCookies : resp.headers.get('set-cookie') ? [resp.headers.get('set-cookie')!] : [];
		for (const sc of list) {
			const firstSemi = sc.indexOf(';');
			const pair = firstSemi > 0 ? sc.slice(0, firstSemi) : sc;
			const eq = pair.indexOf('=');
			if (eq < 0) continue;
			this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
		}
	}

	async login(): Promise<void> {
		const { user, pw } = loadCreds();
		// Prime cookies via initial GET
		const r0 = await fetch(`${NRS_BASE}/`, {
			headers: { 'User-Agent': 'TeamTime/1.0' },
			redirect: 'manual'
		});
		this.absorbCookies(r0);

		const body = new URLSearchParams({
			username: user,
			password: pw,
			useCookie: 'useCookie',
			form: 'loginForm',
			loginFormSubmit: 'Log In',
			ReturnTo: ''
		}).toString();

		const r1 = await fetch(`${NRS_BASE}/`, {
			method: 'POST',
			headers: {
				'User-Agent': 'TeamTime/1.0',
				'Content-Type': 'application/x-www-form-urlencoded',
				Cookie: this.cookieHeader()
			},
			body,
			redirect: 'manual'
		});
		this.absorbCookies(r1);

		// Follow redirect manually if any (NRS issues 302 on success)
		if (r1.status === 302 || r1.status === 303) {
			const loc = r1.headers.get('location');
			if (loc) {
				const r2 = await fetch(new URL(loc, NRS_BASE).toString(), {
					headers: { 'User-Agent': 'TeamTime/1.0', Cookie: this.cookieHeader() }
				});
				this.absorbCookies(r2);
			}
		}

		// Verify by hitting a logged-in-only page
		const r3 = await fetch(`${NRS_BASE}/import/type/ImportInv`, {
			headers: { 'User-Agent': 'TeamTime/1.0', Cookie: this.cookieHeader() }
		});
		const html = await r3.text();
		if (html.includes('Log in') && !html.includes('Log Out')) {
			throw new Error('NRS login failed — credentials may be wrong');
		}
		log.info({ cookieCount: this.cookies.size }, 'NRS web-UI login OK');
	}

	/** Upload CSV bytes via plupload's destination, returns the new file id. */
	async uploadFile(csv: Uint8Array, filename: string): Promise<number> {
		const fd = new FormData();
		const blob = new Blob([csv as BlobPart], { type: 'text/csv' });
		fd.append('file', blob, filename);

		const r = await fetch(`${NRS_BASE}/attachments/upload.php`, {
			method: 'POST',
			headers: { 'User-Agent': 'TeamTime/1.0', Cookie: this.cookieHeader() },
			body: fd
		});
		const text = await r.text();
		this.absorbCookies(r);

		let json: { id?: number; error?: string };
		try {
			json = JSON.parse(text);
		} catch {
			throw new Error(`NRS upload response not JSON: ${text.slice(0, 200)}`);
		}
		if (json.error) throw new Error(`NRS upload error: ${json.error}`);
		if (!json.id) throw new Error(`NRS upload returned no id: ${text.slice(0, 200)}`);
		log.info({ fileId: json.id, filename }, 'Uploaded CSV to NRS attachments');
		return json.id;
	}

	/**
	 * Submit the importer form. Defaults to permissive validation
	 * (Ignore/Goods) so most well-formed rows go through.
	 */
	async submitImport(opts: {
		fileId: number;
		filename: string;
		passThroughApVendorId: number;
		clearInventory?: boolean;
		allowDuplicateNames?: boolean;
		useAltPartForVendorParts?: boolean;
	}): Promise<{ ok: boolean; messages: string[]; rawHtmlSample: string }> {
		const body = new URLSearchParams();
		body.set('go', '1');
		body.set('ReturnTo', '');
		body.set('importFile_id', String(opts.fileId));
		body.set('importFile', opts.filename);
		body.set('frmPassThroughApVendorId', String(opts.passThroughApVendorId));
		// Validation modes — Ignore = "Not Required" so NRS doesn't reject rows
		// missing those columns. Our CSV puts the values in the columns directly.
		body.set('frmSalesTaxType', 'Ignore');
		body.set('frmInvCategory', 'Ignore');
		body.set('frmInvUnitOfMeasure', 'Ignore');
		// Inventory type: force Goods (we don't import Services)
		body.set('frmGoodsServices', 'Goods');
		// GL accounts — defaults observed in the page HTML
		body.set('frmGlAccountIdBillingGoods', '22193');
		body.set('frmGlAccountIdBillingGoodsNonTaxable', '22259');
		body.set('frmGlAccountIdBillingServices', '22193');
		body.set('frmGlAccountIdBillingServicesNonTaxable', '22259');
		// Optional checkbox flags
		if (opts.clearInventory) body.set('frmClearInventory', '1');
		if (opts.allowDuplicateNames) body.set('frmAllowDuplicateNames', '1');
		if (opts.useAltPartForVendorParts) body.set('frmUseAltPartForVendorParts', '1');

		const r = await fetch(`${NRS_BASE}/import/type/ImportInv`, {
			method: 'POST',
			headers: {
				'User-Agent': 'TeamTime/1.0',
				'Content-Type': 'application/x-www-form-urlencoded',
				Cookie: this.cookieHeader()
			},
			body: body.toString(),
			redirect: 'follow'
		});
		this.absorbCookies(r);
		const html = await r.text();

		// Parse for success/error messages. NRS shows them in <span class="...">
		// or in a results section after submit. We extract a few patterns.
		const messages: string[] = [];
		const noticeRe = /<span\s+class="(?:Notice|Success|Error|notice|success|error)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
		for (const m of html.matchAll(noticeRe)) {
			const txt = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
			if (txt) messages.push(txt);
		}

		// Heuristic: did the import indicate success?
		const lower = html.toLowerCase();
		const hasError =
			lower.includes('error') &&
			(lower.includes('imported 0') || /failed.*import/i.test(html) || lower.includes('invalid'));
		const looksLikeSuccess =
			!hasError &&
			(/\d+\s*(items?|rows?)\s*(imported|added|saved)/i.test(html) ||
				/import\s+(complete|successful)/i.test(html) ||
				messages.some((m) => /imported|added|saved/i.test(m)));

		log.info(
			{ fileId: opts.fileId, vendor: opts.passThroughApVendorId, ok: looksLikeSuccess, messages },
			'NRS import form submitted'
		);
		return { ok: looksLikeSuccess, messages, rawHtmlSample: html.slice(0, 4000) };
	}
}

/** Convenience: log in, upload + submit in one shot. */
export async function applyCsvViaNrsImporter(opts: {
	csv: string;
	filename: string;
	passThroughApVendorId: number;
}): Promise<{ ok: boolean; messages: string[]; fileId: number; rawHtmlSample: string }> {
	const client = new NrsImporterClient();
	await client.login();
	const csvBytes = new TextEncoder().encode(opts.csv);
	const fileId = await client.uploadFile(csvBytes, opts.filename);
	const result = await client.submitImport({
		fileId,
		filename: opts.filename,
		passThroughApVendorId: opts.passThroughApVendorId
	});
	return { ...result, fileId };
}
