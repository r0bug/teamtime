/**
 * NRS REST API Client
 *
 * Fetches POS sales data from the NRS accounting API and aggregates
 * it into the VendorSalesData format used by salesSnapshots.
 *
 * API contract (discovered via exploration):
 * - Auth: `company` header with the API key value
 * - Method: POST with JSON body for filtering (GET ignores params)
 * - Endpoints: posstore/list, possales/getall, vendor/list
 * - Pagination: response has `nextPage` (number|null) and `list` (array)
 * - Path A: Each sale line item includes vendorId, vendorName, totalPrice,
 *   vendorPortionOfTotalPrice, and retainedAmountFromVendor — full commission data
 */

import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';
import type { VendorSalesData } from '$lib/server/db/schema';

const log = createLogger('services:nrs-api');

const API_BASE = 'https://www.nrsaccounting.com/api';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single POS sale line item from the NRS API. */
export interface NrsSaleRecord {
	arCashRegId: number;
	arCashRegDetailId: number;
	posted: boolean;
	storeId: number;
	storeName: string;
	userName: string;
	invoiceDate: string;
	vendorId: number;
	vendorName: string | null;
	partId: number;
	partNumber: string | null;
	partName: string | null;
	partType: string | null;
	itemDescription: string;
	quantity: number;
	price: number;
	totalPrice: number;
	tax: number;
	shipping: number;
	lineItemTotalPrice: number;
	originalUnitPrice: number;
	originalTotalPrice: number;
	discountPercent: string;
	discountAmount: number;
	vendorPortionOfTotalPrice: number;
	retainedAmountFromVendor: number;
	existingPaymentsToVendor: number;
	totalRemittanceDueVendor: number;
	createDateTime: string;
	latestChangeDateTime: string;
	[key: string]: unknown;
}

export interface NrsPagedResponse {
	nextPage: number | null;
	list: NrsSaleRecord[];
}

export interface NrsSalesQuery {
	storeId: number;
	invoiceDate?: string;
	sincedatetime?: string;
	pagesize?: number;
	page?: number;
}

export interface NrsStore {
	storeId: number;
	name: string;
	address1: string | null;
	city: string | null;
	state: string | null;
	zipCode: string | null;
	taxRate: number;
	[key: string]: unknown;
}

export interface DailyVendorSalesResult {
	date: string;
	vendors: VendorSalesData[];
	totals: {
		total_sales: number;
		total_vendor_amount: number;
		total_retained: number;
		vendor_count: number;
	};
	transactionCount: number;
	/** Raw line items from the API, for storing in salesTransactions table */
	records: NrsSaleRecord[];
}

// ── Client ───────────────────────────────────────────────────────────────────

function getApiKey(): string {
	const key = env.NRS_API_KEY;
	if (!key) throw new Error('NRS_API_KEY environment variable is not set');
	return key;
}

function getStoreId(): number {
	return parseInt(env.NRS_STORE_ID || '20', 10);
}

/**
 * Make an authenticated POST request to the NRS API.
 * Auth: `company` header with the API key.
 * Filtering: JSON body (GET params are ignored by the API).
 */
async function apiPost<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
	const url = `${API_BASE}/${endpoint}`;

	log.debug({ endpoint, body }, 'NRS API request');

	const resp = await fetch(url, {
		method: 'POST',
		signal: AbortSignal.timeout(30000),
		headers: {
			'Content-Type': 'application/json',
			company: getApiKey()
		},
		body: JSON.stringify(body)
	});

	const text = await resp.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		log.error({ endpoint, status: resp.status, body: text.slice(0, 500) }, 'NRS API non-JSON response');
		throw new Error(`NRS API ${endpoint}: non-JSON response (${resp.status})`);
	}

	// NRS returns 200 even for errors, with {"err": {"num": N, "msg": "..."}}
	if (typeof data === 'object' && data !== null && 'err' in (data as Record<string, unknown>)) {
		const err = (data as { err: { num: number; msg: string } }).err;
		// err 203 = "No Sales Found" — not a real error, just empty
		if (err.num === 203) {
			return { list: [], nextPage: null } as T;
		}
		log.error({ endpoint, errNum: err.num, errMsg: err.msg }, 'NRS API error');
		throw new Error(`NRS API ${endpoint}: err ${err.num} - ${err.msg}`);
	}

	return data as T;
}

/**
 * GET request with `company` header (for endpoints that don't need body params).
 */
async function apiGet<T>(endpoint: string): Promise<T> {
	const url = `${API_BASE}/${endpoint}`;

	const resp = await fetch(url, {
		signal: AbortSignal.timeout(30000),
		headers: { company: getApiKey() }
	});

	const text = await resp.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`NRS API ${endpoint}: non-JSON response (${resp.status})`);
	}

	if (typeof data === 'object' && data !== null && 'err' in (data as Record<string, unknown>)) {
		const err = (data as { err: { num: number; msg: string } }).err;
		throw new Error(`NRS API ${endpoint}: err ${err.num} - ${err.msg}`);
	}

	return data as T;
}

// ── Public Methods ───────────────────────────────────────────────────────────

export interface NrsEmployee {
	employeeId: number;
	number: string | null; // NRS employee number (payroll id shown on checks)
	displayName: string;
	firstName: string;
	lastName: string;
	canUseClock: boolean;
}

/**
 * Payroll employees from `POST employee/list`. Read-only. `activeOnly` limits
 * to currently-employed people. The `creds[]` field (PINs) is deliberately
 * dropped here — callers only need identity + number for payroll mapping.
 */
export async function getEmployees(activeOnly = true): Promise<NrsEmployee[]> {
	const data = await apiPost<{ list?: Record<string, unknown>[] }>('employee/list', { activeOnly });
	const list = Array.isArray(data.list) ? data.list : [];
	return list.map((e) => ({
		employeeId: Number(e.employeeId),
		number: e.number != null && String(e.number).length > 0 ? String(e.number) : null,
		displayName: String(e.displayName ?? ''),
		firstName: String(e.firstName ?? ''),
		lastName: String(e.lastName ?? ''),
		canUseClock: Boolean(e.canUseClock)
	}));
}

/** List vendors. */
export async function getVendors(storeId?: number): Promise<{ vendorId: number; name: string }[]> {
	const data = await apiGet<{ list: { vendorId: number; name: string }[] }>(`vendor/list?storeId=${storeId ?? getStoreId()}`);
	return data.list;
}

/** Full per-vendor record from `POST vendor/get`. */
export interface NrsVendorDetail {
	vendorId: number;
	companyId: number;
	vendorCode: string;            // 2-3 char SKU prefix in NRS (e.g. 'CAR' for AARON CARTER)
	address: string;
	address2: string;
	address3: string;
	city: string;
	state: string;
	zipCode: string;
	country: string;
	countryCode: string;
	countryCode3: string;
	contact: string;               // contact name
	email: string;
	phone: string;
	fax: string;
	fedid: string;
	require1099: boolean;
	nameFor1099: string;
	ourAccountNumber: string;
	minimumOrderValue: number;
	notes: string;                 // free text — often holds commission rate
	vendorNumber: string;
	portalAccess: boolean;         // NRS's own concept of vendor portal access
	[key: string]: unknown;
}

/**
 * Fetch the full vendor record from NRS via `POST vendor/get`.
 *
 * Returns null when NRS doesn't have a record for that vendorId (err 201
 * "No Data Received"), so callers can keep a bulk sync going through a few
 * orphaned ids without aborting.
 */
export async function getVendorDetail(vendorId: number): Promise<NrsVendorDetail | null> {
	try {
		const raw = await apiPost<{ get?: NrsVendorDetail }>('vendor/get', { vendorId });
		if (!raw.get) return null;
		return raw.get;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// err 201 = "No Data Received" — vendor not found, not a real failure
		if (msg.includes('err 201')) return null;
		throw err;
	}
}

/**
 * Fetch sales line items for a single vendor across a date range.
 * NRS's possales/getall doesn't filter by vendor server-side, so we pull
 * the date range and filter client-side.
 */
export async function getVendorSales(opts: {
	nrsVendorId: number;
	startDate: string; // YYYY-MM-DD
	endDate: string;   // YYYY-MM-DD inclusive
	storeId?: number;
}): Promise<NrsSaleRecord[]> {
	const sid = opts.storeId ?? getStoreId();
	const start = new Date(opts.startDate);
	const end = new Date(opts.endDate);
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
		throw new Error(`Invalid date range: ${opts.startDate} → ${opts.endDate}`);
	}

	const all: NrsSaleRecord[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		const dateStr = cursor.toISOString().slice(0, 10);
		const records = await getSalesAllPages({ storeId: sid, invoiceDate: dateStr });
		for (const r of records) {
			if (r.vendorId === opts.nrsVendorId) all.push(r);
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	log.info(
		{ nrsVendorId: opts.nrsVendorId, start: opts.startDate, end: opts.endDate, count: all.length },
		'Fetched per-vendor sales from NRS'
	);
	return all;
}

/** Get a single page of sales records. */
export async function getSales(query: NrsSalesQuery): Promise<NrsPagedResponse> {
	return apiPost<NrsPagedResponse>('possales/getall', query as unknown as Record<string, unknown>);
}

/** Fetch all pages of sales for given query. */
export async function getSalesAllPages(query: NrsSalesQuery): Promise<NrsSaleRecord[]> {
	const pageSize = query.pagesize || 100;
	let page = query.page || 1;
	const allRecords: NrsSaleRecord[] = [];

	while (true) {
		const data = await getSales({ ...query, pagesize: pageSize, page });

		if (!data.list || data.list.length === 0) break;
		allRecords.push(...data.list);

		if (!data.nextPage) break;
		page = data.nextPage;

		if (page > 500) {
			log.warn({ totalRecords: allRecords.length }, 'Hit pagination safety limit (500 pages)');
			break;
		}
	}

	log.info({ totalRecords: allRecords.length, pages: page }, 'Fetched all sales pages');
	return allRecords;
}

/**
 * Fetch all sales for a date and aggregate by vendor.
 *
 * Produces the exact VendorSalesData[] format that the scraper produces:
 * - total_sales: sum of totalPrice per vendor
 * - vendor_amount: sum of vendorPortionOfTotalPrice per vendor
 * - retained_amount: sum of retainedAmountFromVendor per vendor
 */
export async function getDailyVendorSales(
	date: string,
	storeId?: number
): Promise<DailyVendorSalesResult> {
	const sid = storeId ?? getStoreId();

	log.info({ date, storeId: sid }, 'Fetching daily vendor sales from NRS API');

	const records = await getSalesAllPages({
		storeId: sid,
		invoiceDate: date
	});

	if (records.length === 0) {
		log.warn({ date }, 'No sales records found for date');
		return {
			date,
			vendors: [],
			totals: { total_sales: 0, total_vendor_amount: 0, total_retained: 0, vendor_count: 0 },
			transactionCount: 0,
			records: []
		};
	}

	// Aggregate by vendor
	const vendorMap = new Map<number, {
		vendor_id: string;
		vendor_name: string;
		total_sales: number;
		vendor_amount: number;
		retained_amount: number;
	}>();

	for (const record of records) {
		if (!record.vendorId || record.vendorId === 0) continue;

		const sales = record.totalPrice || 0;
		const vendorAmt = record.vendorPortionOfTotalPrice || 0;
		const retained = record.retainedAmountFromVendor || 0;

		const existing = vendorMap.get(record.vendorId);
		if (existing) {
			existing.total_sales = round2(existing.total_sales + sales);
			existing.vendor_amount = round2(existing.vendor_amount + vendorAmt);
			existing.retained_amount = round2(existing.retained_amount + retained);
		} else {
			vendorMap.set(record.vendorId, {
				vendor_id: String(record.vendorId),
				vendor_name: record.vendorName || 'Unknown',
				total_sales: round2(sales),
				vendor_amount: round2(vendorAmt),
				retained_amount: round2(retained)
			});
		}
	}

	const vendors: VendorSalesData[] = Array.from(vendorMap.values());
	const totals = {
		total_sales: round2(vendors.reduce((sum, v) => sum + v.total_sales, 0)),
		total_vendor_amount: round2(vendors.reduce((sum, v) => sum + v.vendor_amount, 0)),
		total_retained: round2(vendors.reduce((sum, v) => sum + v.retained_amount, 0)),
		vendor_count: vendors.length
	};

	log.info({
		date,
		vendorCount: totals.vendor_count,
		totalSales: totals.total_sales,
		totalRetained: totals.total_retained,
		recordsProcessed: records.length
	}, 'Aggregated daily vendor sales from NRS API');

	return { date, vendors, totals, transactionCount: records.length, records };
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// ── Inventory (invstock) ──────────────────────────────────────────────────────
//
// Shipped by NRS 2026-06. Auth/transport identical to the rest of this client.
// Quirks worth remembering (discovered via probe + the official docs at
// /support/api):
//   - invstock/list ignores query params and returns ALL items; filter
//     client-side or use getall's server-side passThroughApVendorId filter.
//   - invstock/getall returns its array under the key `getall` (NOT `list`),
//     paginates via `nextPage`, and supports sinceDateTime / passThroughApVendorId
//     / active filters (pageSize max 2000).
//   - invstock/get returns the record under `get`.
//   - invstock/save is CREATE-only and returns `{ saved: true }` with no id — to
//     learn the new invStockId, re-query getall by vendor + partNumber.

/** Lightweight row from `GET invstock/list` and the simplified getall projection. */
export interface NrsInvStockListItem {
	invStockId: number;
	displayName: string | null;
	partNumber: string | null;
	partSort: string | number | null;
	name: string | null;
	description: string | null;
	invType?: string | null;
	categoryId?: number | null;
	categoryName?: string | null;
	/** NRS uses `false` (not null) to mean "no pass-through vendor". */
	passThroughVendorId: number | false | null;
	passThroughVendorName: string | false | null;
	[key: string]: unknown;
}

/** Full detail row from `POST invstock/getall` (key `getall`) / `POST invstock/get` (key `get`). */
export interface NrsInvStockDetail extends NrsInvStockListItem {
	active: boolean;
	arSalesTaxType: string | null;
	nonTaxable: boolean;
	quantityOnHand: number;
	currentCost: number;
	retailPrice: number;
	notes: string | null;
	latestChangeDateTime?: string;
}

export interface NrsInvCategory {
	invCategoryId: number;
	code: string | null;
	description: string | null;
}

/** Inputs for `invstock/save` (create). Mirrors the documented optional fields. */
export interface SaveInvStockInput {
	name: string; // required
	partNumber?: string; // auto-generated by NRS if blank and a sequence is configured
	description?: string;
	invType?: 'Goods' | 'Service' | 'Assembly';
	retailPrice?: number;
	currentCost?: number;
	notes?: string;
	printTag?: boolean;
	/** Sets the item as pass-through for this NRS vendor id (the attribution key). */
	passThroughApVendorId?: number;
	invCategoryId?: number;
	categoryName?: string;
	categoryCode?: string;
	[key: string]: unknown;
}

/** All inventory categories (id/code/description), used to resolve `invCategoryId` on save. */
export async function getInvCategories(): Promise<NrsInvCategory[]> {
	const data = await apiGet<{ list: NrsInvCategory[] }>('invcategory/list');
	return data.list ?? [];
}

interface InvStockGetAllResponse {
	getall?: NrsInvStockDetail[];
	nextPage: number | null;
}

/**
 * Fetch full-detail inventory for a single pass-through vendor via the
 * documented server-side `passThroughApVendorId` filter, following pagination.
 * This is the authoritative source for "which items belong to this vendor".
 */
export async function getAllInvStockForVendor(nrsVendorId: number): Promise<NrsInvStockDetail[]> {
	const all: NrsInvStockDetail[] = [];
	let page = 1;
	while (page <= 50) {
		const data = await apiPost<InvStockGetAllResponse>('invstock/getall', {
			passThroughApVendorId: nrsVendorId,
			pageSize: 2000,
			page
		});
		const rows = data.getall ?? [];
		all.push(...rows);
		if (!data.nextPage) break;
		page = data.nextPage;
	}
	return all;
}

// Per-vendor cache for the full inventory pull, serving STALE data while a
// refresh runs. getAllInvStockForVendor pages the whole inventory (30s timeout
// per page), so a slow NRS could exceed the desktop app's HTTP timeout and the
// Inventory tab errored out ("sometimes shows, sometimes doesn't"). Now:
//   - fresh (<60s):    return immediately
//   - stale:           return the old list immediately, refresh in background
//   - cold first load: wait up to 12s, then give up (caller degrades to DB
//     sources) — the fetch keeps running and fills the cache for the next click
const invStockCache = new Map<number, { items: NrsInvStockDetail[]; fetchedAt: number }>();
const invStockInflight = new Map<number, Promise<NrsInvStockDetail[]>>();
const INV_STOCK_FRESH_MS = 60_000;
const INV_STOCK_FIRST_LOAD_WAIT_MS = 12_000;

/** Cached wrapper over getAllInvStockForVendor (60s TTL, stale-while-revalidate). */
export async function getInvStockForVendorCached(nrsVendorId: number): Promise<NrsInvStockDetail[]> {
	const hit = invStockCache.get(nrsVendorId);
	if (hit && Date.now() - hit.fetchedAt < INV_STOCK_FRESH_MS) return hit.items;

	let refresh = invStockInflight.get(nrsVendorId);
	if (!refresh) {
		refresh = getAllInvStockForVendor(nrsVendorId)
			.then((items) => {
				invStockCache.set(nrsVendorId, { items, fetchedAt: Date.now() });
				return items;
			})
			.finally(() => invStockInflight.delete(nrsVendorId));
		invStockInflight.set(nrsVendorId, refresh);
		// A caller may stop waiting (stale hit / cold-load deadline) — this side
		// branch keeps a late failure from becoming an unhandled rejection.
		refresh.catch(() => {});
	}

	if (hit) return hit.items; // stale-while-revalidate

	// Cold first load: bounded wait so the endpoint (and the desktop app's own
	// HTTP timeout) never hangs on NRS; the refresh continues past the deadline.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			refresh,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('NRS inventory fetch timed out (still loading in background)')),
					INV_STOCK_FIRST_LOAD_WAIT_MS
				);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** Single inventory item by NRS invStockId (returns null when not found, err 203 "Stock Id Expected"). */
export async function getInvStock(invStockId: number): Promise<NrsInvStockDetail | null> {
	try {
		const raw = await apiPost<{ get?: NrsInvStockDetail }>('invstock/get', { invStockId });
		return raw.get ?? null;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('err 203') || msg.includes('err 201')) return null;
		throw err;
	}
}

export interface SaveInvStockResult {
	saved: boolean;
	/** Resolved after creation by re-querying getall for the vendor + partNumber. */
	invStockId: number | null;
	raw: Record<string, unknown>;
}

/**
 * Create a new inventory item via `invstock/save`.
 *
 * NRS returns only `{ saved: true }`, so when a partNumber and vendor are known
 * we re-query the vendor's items to resolve the new invStockId (best-effort —
 * a null id doesn't mean the save failed).
 */
export async function saveInvStock(input: SaveInvStockInput): Promise<SaveInvStockResult> {
	if (!input.name?.trim()) throw new Error('saveInvStock: name is required');

	const raw = await apiPost<Record<string, unknown>>('invstock/save', input as Record<string, unknown>);
	const saved = raw.saved === true;

	let invStockId: number | null = null;
	if (saved && input.passThroughApVendorId && input.partNumber) {
		try {
			const items = await getAllInvStockForVendor(input.passThroughApVendorId);
			const wanted = input.partNumber.trim().toUpperCase();
			const match = items.find((i) => (i.partNumber ?? '').trim().toUpperCase() === wanted);
			invStockId = match?.invStockId ?? null;
		} catch (err) {
			log.warn({ err, partNumber: input.partNumber }, 'saveInvStock: post-create id lookup failed');
		}
	}

	return { saved, invStockId, raw };
}
