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
