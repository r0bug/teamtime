/**
 * NRS web-UI client — used to read fields the JSON API doesn't expose.
 *
 * The NRS REST API (see `nrs-api-client.ts`) is the primary source of truth
 * for vendor identity. But it does NOT expose the per-vendor "Inactive" flag
 * that NRS staff set in the AP Vendor Management web form. This module logs
 * into the same web UI the legacy `scraper-imports/nrs_scraper.py` uses and
 * scrapes the inactive checkbox state.
 *
 * Auth model: form-based POST to the homepage with username + password,
 * receives an `NRSSESS` cookie that authenticates subsequent GETs. The
 * session is reused for the duration of one process — re-login on 401/403
 * or when a parse heuristic flags us as logged out.
 *
 * Credentials live in `scraper-imports/nrscreds.secret` (mode 600, gitignored)
 * as `username:password` on the first line. We read that file at first use
 * rather than introducing new env vars — same pattern the Python scraper uses.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:nrs-web');

const BASE_URL = 'https://www.nrsaccounting.com';
const CREDS_PATH = join(process.cwd(), 'scraper-imports', 'nrscreds.secret');

let sessionCookie: string | null = null;
let credentials: { username: string; password: string } | null = null;

function loadCredentials(): { username: string; password: string } {
	if (credentials) return credentials;
	if (!existsSync(CREDS_PATH)) {
		throw new Error(`NRS web credentials not found at ${CREDS_PATH}`);
	}
	const raw = readFileSync(CREDS_PATH, 'utf-8').trim();
	const firstLine = raw.split('\n')[0];
	const idx = firstLine.indexOf(':');
	if (idx <= 0) {
		throw new Error(`NRS credentials file malformed (expected user:pass on first line)`);
	}
	credentials = {
		username: firstLine.slice(0, idx),
		password: firstLine.slice(idx + 1)
	};
	return credentials;
}

async function login(): Promise<string> {
	const { username, password } = loadCredentials();
	const body = new URLSearchParams({
		username,
		password,
		useCookie: 'useCookie',
		form: 'loginForm',
		loginFormSubmit: 'Log In',
		ReturnTo: ''
	});

	const resp = await fetch(BASE_URL + '/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'TeamTime-NRSSync/1.0'
		},
		body,
		redirect: 'manual',
		signal: AbortSignal.timeout(20000)
	});

	const setCookie = resp.headers.get('set-cookie') ?? '';
	const match = setCookie.match(/NRSSESS=([^;]+)/);
	if (!match) {
		throw new Error(`NRS login: no NRSSESS cookie in response (status ${resp.status})`);
	}
	const cookie = `NRSSESS=${match[1]}`;

	// Verify the cookie actually works by checking we get an authed page.
	const probeResp = await fetch(BASE_URL + '/', {
		headers: { Cookie: cookie, 'User-Agent': 'TeamTime-NRSSync/1.0' },
		signal: AbortSignal.timeout(20000)
	});
	const probeBody = await probeResp.text();
	if (!probeBody.includes('Log Out') && !probeBody.includes('applicationAction=logout')) {
		throw new Error('NRS login: cookie did not authenticate (no Log Out marker)');
	}

	sessionCookie = cookie;
	log.info('NRS web login successful');
	return cookie;
}

async function getCookie(): Promise<string> {
	if (sessionCookie) return sessionCookie;
	return login();
}

const UA = 'TeamTime-NRSSync/1.0';

/** Authenticated GET returning the page body, with one re-login retry on a
 *  logged-out heuristic (`mustContain` absent from the response). */
async function authedGet(path: string, mustContain?: string): Promise<string> {
	let cookie = await getCookie();
	const url = `${BASE_URL}/${path.replace(/^\//, '')}`;
	let html = await (
		await fetch(url, { headers: { Cookie: cookie, 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
	).text();
	if (mustContain && !html.includes(mustContain)) {
		sessionCookie = null;
		cookie = await getCookie();
		html = await (
			await fetch(url, { headers: { Cookie: cookie, 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
		).text();
	}
	return html;
}

/** Authenticated form POST (url-encoded). Values are appended in insertion
 *  order; array values (e.g. `frmCount[15168]`) pass their key verbatim. */
async function authedPostForm(path: string, fields: Record<string, string>): Promise<string> {
	const cookie = await getCookie();
	const url = `${BASE_URL}/${path.replace(/^\//, '')}`;
	const body = new URLSearchParams();
	for (const [k, v] of Object.entries(fields)) body.append(k, v ?? '');
	const resp = await fetch(url, {
		method: 'POST',
		redirect: 'follow',
		headers: {
			Cookie: cookie,
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded',
			Referer: url,
			Origin: BASE_URL
		},
		body: body.toString(),
		signal: AbortSignal.timeout(30000)
	});
	return resp.text();
}

function parseTextarea(html: string, name: string): string | null {
	const re = new RegExp(`<textarea[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</textarea>`, 'i');
	const m = html.match(re);
	if (!m) return null;
	// NRS HTML-escapes textarea contents; decode the handful that appear.
	return m[1]
		.replace(/&mdash;/g, '—')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.trim();
}

/** The `value` of the currently-checked radio in a named group, or null. */
function parseCheckedRadio(html: string, name: string): string | null {
	const re = new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'gi');
	for (const m of html.matchAll(re)) {
		if (/\bchecked\b/i.test(m[0])) {
			const v = m[0].match(/value=["']([^"']*)["']/i);
			if (v) return v[1];
		}
	}
	return null;
}

export interface InvStockEditState {
	invStockId: number;
	partNumber: string | null;
	name: string | null;
	description: string | null;
	retailPrice: number | null;
	active: boolean;
	/** All parsed frmHead* fields, so an update can round-trip untouched values. */
	fields: Record<string, string>;
}

/**
 * GET the NRS inventory edit form for one item and capture the current
 * frmHead* field state so an update can preserve every value it isn't changing.
 * Returns null if the form can't be found (bad id / logged out after retry).
 *
 * See nrs-pos-api-contract memory for the verified field list — NRS has no REST
 * update path, so edits round-trip through this web form.
 */
export async function getInvStockEditState(invStockId: number): Promise<InvStockEditState | null> {
	const html = await authedGet(
		`inventory/invStockManagement?form=${invStockId}`,
		'frmHeadPartNumber'
	);
	if (!html.includes('frmHeadPartNumber')) {
		log.warn({ invStockId }, 'NRS web: inventory edit form not found');
		return null;
	}

	// Strip <script> blocks first — the form template contains JS that builds
	// sub-table rows with `name="frmXDetail[' + i + ']"` placeholders that would
	// otherwise pollute a generic field parse.
	const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');

	const text = (n: string) => parseTextField(body, n);
	const fields: Record<string, string> = {};
	const set = (n: string, v: string | null | undefined) => {
		if (v !== null && v !== undefined) fields[n] = v;
	};

	set('frmHeadPartNumber', text('frmHeadPartNumber'));
	set('frmHeadName', parseTextarea(body, 'frmHeadName') ?? '');
	set('frmHeadDescription', parseTextarea(body, 'frmHeadDescription') ?? '');
	set('frmHeadAltPartNumber', text('frmHeadAltPartNumber') ?? '');
	set('frmHeadAltDescription', parseTextarea(body, 'frmHeadAltDescription') ?? '');
	set('frmHeadPutAwayLocation', text('frmHeadPutAwayLocation') ?? '');
	set('frmHeadInvType', parseCheckedRadio(body, 'frmHeadInvType') ?? 'Goods');
	set('frmHeadInvCategoryId', parseSelectedValue(body, 'frmHeadInvCategoryId') ?? '');
	if (parseCheckbox(body, 'frmHeadIsPassThroughItem')) fields['frmHeadIsPassThroughItem'] = '1';
	set('frmHeadPassThroughApVendorId', parseSelectedValue(body, 'frmHeadPassThroughApVendorId') ?? '');
	set('frmHeadArSalesTaxTypeId', parseCheckedRadio(body, 'frmHeadArSalesTaxTypeId') ?? '31');
	set('frmHeadCurrentCost', text('frmHeadCurrentCost') ?? '0');
	set('frmHeadCurrentCostDate', text('frmHeadCurrentCostDate') ?? '');
	set('frmHeadRetailPrice', text('frmHeadRetailPrice') ?? '');
	set('frmHeadReorderQuantity', text('frmHeadReorderQuantity') ?? '0');
	set('frmHeadQuantityPerCarton', text('frmHeadQuantityPerCarton') ?? '0');
	set('frmHeadInvUnitOfMeasureId', text('frmHeadInvUnitOfMeasureId') ?? '');
	set('frmHeadNotes', parseTextarea(body, 'frmHeadNotes') ?? '');
	set('frmHeadLeadDays', text('frmHeadLeadDays') ?? '0');
	set('frmHeadGlAccountIdBilling', parseSelectedValue(body, 'frmHeadGlAccountIdBilling') ?? '');
	set('frmHeadGlAccountIdBillingNonTaxable', parseSelectedValue(body, 'frmHeadGlAccountIdBillingNonTaxable') ?? '');
	set('frmHeadGlAccountIdReceiving', parseSelectedValue(body, 'frmHeadGlAccountIdReceiving') ?? '');
	const active = parseCheckbox(body, 'frmHeadActive') === true;
	if (active) fields['frmHeadActive'] = '1';
	if (parseCheckbox(body, 'frmHeadDoNotTrackCost')) fields['frmHeadDoNotTrackCost'] = '1';

	const priceRaw = text('frmHeadRetailPrice');
	return {
		invStockId,
		partNumber: text('frmHeadPartNumber'),
		name: parseTextarea(body, 'frmHeadName'),
		description: parseTextarea(body, 'frmHeadDescription'),
		retailPrice: priceRaw ? parseFloat(priceRaw) : null,
		active,
		fields
	};
}

export interface InvStockUpdate {
	name?: string;
	description?: string;
	retailPriceDollars?: number;
	/** false → deactivate (frmHeadActive omitted); true → keep/mark active. */
	active?: boolean;
}

/**
 * Update an NRS item in place via the web edit form. Reads current state,
 * overrides only the provided fields, and POSTs the full form back so nothing
 * else is disturbed. Returns the post-update state read back from NRS.
 *
 * Deactivate = `active: false` (never a hard delete — NRS keeps history).
 */
export async function updateInvStockViaWeb(
	invStockId: number,
	update: InvStockUpdate
): Promise<InvStockEditState> {
	const before = await getInvStockEditState(invStockId);
	if (!before) throw new Error(`NRS item ${invStockId} not found (cannot update)`);

	const fields: Record<string, string> = { ...before.fields, ReturnTo: '', form: String(invStockId), go: '1' };
	if (update.name !== undefined) fields['frmHeadName'] = update.name;
	if (update.description !== undefined) fields['frmHeadDescription'] = update.description;
	if (update.retailPriceDollars !== undefined) {
		fields['frmHeadRetailPrice'] = update.retailPriceDollars.toFixed(2);
	}
	if (update.active === false) delete fields['frmHeadActive'];
	else if (update.active === true) fields['frmHeadActive'] = '1';

	await authedPostForm('inventory/invStockManagement?', fields);

	const after = await getInvStockEditState(invStockId);
	if (!after) throw new Error(`NRS item ${invStockId} unreadable after update`);
	return after;
}

/**
 * Set an item's on-hand quantity to an absolute value via the two-step
 * Physical Entry form. Only the target item's `frmCount[<id>]` is submitted;
 * every other item's count is left blank (NRS treats blank as "not counted →
 * unchanged", verified on dev). Follows pagination to find the item.
 *
 * NRS physical count is absolute — callers wanting "+N" must read the current
 * on-hand first (see nrs-api-client.getInvStock). Returns true on success.
 */
export async function setInvStockQuantityViaWeb(
	invStockId: number,
	absoluteCount: number,
	opts: { countDate: string } // MM/DD/YYYY
): Promise<boolean> {
	// Stage 1: open the count session (all categories, end-of-day).
	await authedPostForm('inventory/invPhysicalEntry', {
		ReturnTo: '',
		go: 'yes',
		countDate: opts.countDate,
		countWhen: 'end'
	});

	// Stage 2: fetch page 1 only to capture the ReturnTo token, then POST the
	// save with ONLY the target item's frmCount[]. Verified on dev NRS: the
	// item does NOT need to be rendered on the page for its count to be
	// accepted, and every OTHER item's blank count is treated as "not counted →
	// unchanged" (no mass-zeroing). See nrs-pos-api-contract memory.
	const page1 = await authedPostForm('inventory/invPhysicalEntry', {
		go: 'yes',
		countDate: opts.countDate,
		countWhen: 'end',
		p: '1'
	});
	const rt = page1.match(/name="ReturnTo"\s+value="([^"]*)"/i);
	if (!rt) {
		log.warn({ invStockId }, 'NRS physical entry: no ReturnTo token on count page');
		return false;
	}

	await authedPostForm('inventory/invPhysicalEntry', {
		ReturnTo: rt[1],
		go: 'save',
		countDate: opts.countDate,
		countWhen: 'end',
		p: '1',
		submit: 'Save and Goto Next Page',
		[`frmCount[${invStockId}]`]: String(absoluteCount)
	});
	return true;
}

export interface VendorWebFlags {
	isInactive: boolean;
	isPassThrough: boolean;
	passThroughPercent: number | null;
	arCustomerId: string | null;
	monthlyRentCents: number | null;
}

function parseCheckbox(html: string, name: string): boolean | null {
	const re = new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'i');
	const match = html.match(re);
	if (!match) return null;
	return /checked\s*=\s*["']?checked/i.test(match[0]);
}

function parseTextField(html: string, name: string): string | null {
	const re = new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'i');
	const match = html.match(re);
	if (!match) return null;
	const valMatch = match[0].match(/value=["']([^"']*)["']/i);
	return valMatch ? valMatch[1] : null;
}

/**
 * Parse the currently-selected option value from a <select name="...">.
 * Returns null when the select isn't found or no option is marked selected.
 */
function parseSelectedValue(html: string, name: string): string | null {
	const selectRe = new RegExp(
		`<select[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</select>`,
		'i'
	);
	const block = html.match(selectRe);
	if (!block) return null;
	// Find the option with `selected` attribute. NRS templates may render
	// `selected`, `selected="selected"`, or `selected="true"` — match permissively.
	const optRe = /<option\s+([^>]*\bselected\b[^>]*)>/i;
	const opt = block[1].match(optRe);
	if (!opt) return null;
	const valMatch = opt[1].match(/value=["']([^"']*)["']/i);
	if (!valMatch) return null;
	const v = valMatch[1].trim();
	return v ? v : null; // empty string value = "-- Select --" placeholder
}

/**
 * Fetch a vendor's AP Vendor Management page and parse the flags TT cares
 * about. Returns null if the page can't be parsed (treated as "unknown" —
 * sync leaves the row unchanged in that case).
 */
export async function getVendorWebFlags(vendorId: number): Promise<VendorWebFlags | null> {
	let cookie = await getCookie();
	const url = `${BASE_URL}/ap/apVendorManagement?form=${vendorId}`;

	let html: string;
	try {
		const resp = await fetch(url, {
			headers: { Cookie: cookie, 'User-Agent': 'TeamTime-NRSSync/1.0' },
			signal: AbortSignal.timeout(20000)
		});
		html = await resp.text();
	} catch (err) {
		log.warn({ vendorId, err: String(err) }, 'NRS web: fetch failed');
		return null;
	}

	// If we got bounced to login (cookie expired), re-login once and retry.
	if (!html.includes('frmHeadInactive')) {
		log.info({ vendorId }, 'NRS web: no inactive marker, re-logging in');
		sessionCookie = null;
		cookie = await getCookie();
		const retry = await fetch(url, {
			headers: { Cookie: cookie, 'User-Agent': 'TeamTime-NRSSync/1.0' },
			signal: AbortSignal.timeout(20000)
		});
		html = await retry.text();
		if (!html.includes('frmHeadInactive')) {
			log.warn({ vendorId }, 'NRS web: still no inactive marker after re-login');
			return null;
		}
	}

	const isInactive = parseCheckbox(html, 'frmHeadInactive');
	const isPassThrough = parseCheckbox(html, 'frmHeadIsPassThrough');
	if (isInactive === null || isPassThrough === null) return null;

	const pctRaw = parseTextField(html, 'frmHeadPassThroughVendorPercent');
	const pct = pctRaw !== null ? parseFloat(pctRaw) : NaN;

	const arCustomerId = parseSelectedValue(html, 'frmHeadArCustomerId');

	// Booth Rent lives on a metadata field (frmMeta13). Stored as a plain
	// dollar string ("75", "100.00"); empty string means "no rent" / unset.
	const rentRaw = parseTextField(html, 'frmMeta13');
	const rentDollars = rentRaw !== null && rentRaw !== '' ? parseFloat(rentRaw) : NaN;
	const monthlyRentCents =
		Number.isFinite(rentDollars) && rentDollars > 0 ? Math.round(rentDollars * 100) : null;

	return {
		isInactive,
		isPassThrough,
		passThroughPercent: Number.isFinite(pct) ? pct : null,
		arCustomerId,
		monthlyRentCents
	};
}

/**
 * Fetch web flags for many vendors with a small concurrency limit.
 * Vendors that fail to parse are omitted from the returned Map.
 */
export async function getVendorWebFlagsBatch(
	vendorIds: number[],
	concurrency = 6
): Promise<Map<number, VendorWebFlags>> {
	const out = new Map<number, VendorWebFlags>();
	let i = 0;

	async function worker() {
		while (i < vendorIds.length) {
			const myI = i++;
			const id = vendorIds[myI];
			const flags = await getVendorWebFlags(id);
			if (flags !== null) out.set(id, flags);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, vendorIds.length) }, worker));
	return out;
}
