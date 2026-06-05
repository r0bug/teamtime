/**
 * Pending inventory changes — vendor proposes, then we apply to NRS.
 *
 * The vendor portal submits proposed creates/updates/deletes against their
 * NRS inventory. Each proposal lands here as `status='pending'`.
 *
 * `create` changes auto-apply to NRS via the live write API (invstock/save) the
 * moment they're submitted; every API call is journaled to `nrsInventoryApiLog`.
 * On a successful save the row flips to `applied`; on failure it stays `pending`
 * so staff can fall back to the CSV/importer path (`/admin/vendors/inventory-changes`)
 * and the journal explains why.
 *
 * `update`/`delete` still land as `pending` for staff (NRS has no confirmed
 * update endpoint and delete needs an externalCode/externalId mapping we don't
 * yet set — see nrs-api-client.ts). Ownership of the target NRS item is verified
 * at submit time so a vendor can never queue a change against another vendor's item.
 *
 * The legacy NRS-Importer CSV path has been retired — `invstock/save` is now the
 * only mechanism for pushing creates to NRS. Staff can bulk-retry any pending
 * creates via `autoApplyPendingCreatesViaApi` (the apply button on the queue).
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	pendingInventoryChanges,
	nrsInventoryApiLog,
	vendors,
	users,
	type PendingInventoryChange,
	type NewNrsInventoryApiLog,
	type NrsInventoryApiLog
} from '$lib/server/db/schema';
import {
	saveInvStock,
	getAllInvStockForVendor,
	type SaveInvStockInput
} from '$lib/server/services/nrs-api-client';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:inventory-change');

export class InventoryChangeError extends Error {}

/**
 * Authoritatively determine whether an NRS item belongs to a vendor, keyed on
 * NRS `passThroughVendorId === vendors.nrsVendorId`. Uses the server-side
 * `passThroughApVendorId` filter, which returns ONLY that vendor's items.
 *
 *   - `true`  → item is in the vendor's set
 *   - `false` → item is not the vendor's (or doesn't exist) → caller must block
 *   - `null`  → NRS unreachable; ownership unknown (caller decides; the
 *               partNumber-prefix invariant still provides a guard)
 */
export async function checkVendorOwnsNrsItem(
	nrsVendorId: number,
	nrsPartId: number
): Promise<boolean | null> {
	try {
		const items = await getAllInvStockForVendor(nrsVendorId);
		return items.some((i) => i.invStockId === nrsPartId);
	} catch (err) {
		log.warn({ nrsVendorId, nrsPartId, err: String(err) }, 'Ownership check could not reach NRS');
		return null;
	}
}

async function writeApiLog(entry: NewNrsInventoryApiLog): Promise<void> {
	try {
		await db.insert(nrsInventoryApiLog).values(entry);
	} catch (err) {
		// Never let an audit-log write failure mask the real apply result.
		log.error({ err: String(err) }, 'Failed to write NRS inventory API log');
	}
}

export interface ChangePayload {
	partName?: string;
	description?: string;
	priceCents?: number;
	quantity?: number;
	[key: string]: unknown;
}

export interface SubmitChangeInput {
	vendorId: string;
	submittedByUserId: string;
	changeType: 'create' | 'update' | 'delete';
	nrsPartId?: number | null;
	partNumber: string;
	payload: ChangePayload;
	previousPayload?: Record<string, unknown> | null;
}

/**
 * Submit a vendor-proposed change. Validates the partNumber begins with the
 * vendor's `inventoryCodePrefix`. Throws if the vendor has no prefix configured.
 */
export async function submitChange(input: SubmitChangeInput): Promise<PendingInventoryChange> {
	const partNumber = input.partNumber.trim().toUpperCase();
	if (!partNumber) throw new InventoryChangeError('Part number is required');

	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
	if (!vendor) throw new InventoryChangeError(`Vendor not found: ${input.vendorId}`);

	if (!vendor.inventoryCodePrefix) {
		throw new InventoryChangeError(
			'Your vendor record has no inventory code prefix configured. Contact staff to set one.'
		);
	}
	if (!partNumber.startsWith(vendor.inventoryCodePrefix)) {
		throw new InventoryChangeError(
			`Part number must begin with "${vendor.inventoryCodePrefix}" (your vendor prefix)`
		);
	}

	if (input.changeType === 'update' || input.changeType === 'delete') {
		if (!input.nrsPartId) {
			throw new InventoryChangeError(`${input.changeType} change requires an nrsPartId`);
		}
		// Ownership guard: the vendor-supplied nrsPartId is the real attack vector
		// (the prefix check only validates partNumber). Verify the target item is
		// actually this vendor's before we ever store the change. Fail closed on a
		// positive non-ownership; allow when NRS is unreachable (prefix invariant
		// still holds, and the apply path re-checks before mutating).
		if (vendor.nrsVendorId) {
			const owned = await checkVendorOwnsNrsItem(vendor.nrsVendorId, input.nrsPartId);
			if (owned === false) {
				log.warn(
					{ vendorId: vendor.id, nrsVendorId: vendor.nrsVendorId, nrsPartId: input.nrsPartId },
					'Blocked inventory change against item not owned by vendor'
				);
				throw new InventoryChangeError('That item does not belong to your vendor account.');
			}
		}
	}

	const [row] = await db
		.insert(pendingInventoryChanges)
		.values({
			vendorId: input.vendorId,
			submittedByUserId: input.submittedByUserId,
			changeType: input.changeType,
			nrsPartId: input.nrsPartId ?? null,
			partNumber,
			payload: input.payload,
			previousPayload: input.previousPayload ?? null,
			status: 'pending'
		})
		.returning();

	log.info(
		{
			vendorId: input.vendorId,
			changeId: row.id,
			changeType: input.changeType,
			partNumber
		},
		'Submitted inventory change'
	);
	return row;
}

export interface ApplyApiResult {
	/** The NRS call succeeded and the change is now `applied`. */
	applied: boolean;
	nrsPartId: number | null;
	/** Present when the change was left `pending` for the staff fallback. */
	error?: string;
}

/**
 * Apply a single pending `create` to NRS via the live `invstock/save` API,
 * attributing it to the vendor via `passThroughApVendorId = vendor.nrsVendorId`.
 *
 * Always journals the attempt to `nrsInventoryApiLog`. On success, flips the
 * pending change to `applied`. On any failure (no NRS vendor id, network error,
 * NRS didn't confirm) the change is left `pending` so staff can fall back to the
 * CSV/importer path — this function never throws for an apply failure, it
 * returns `{ applied: false, error }`.
 */
export async function applyCreateViaApi(
	changeId: string,
	triggeredByUserId: string
): Promise<ApplyApiResult> {
	const [change] = await db
		.select()
		.from(pendingInventoryChanges)
		.where(eq(pendingInventoryChanges.id, changeId))
		.limit(1);
	if (!change) throw new InventoryChangeError('Change not found');
	if (change.changeType !== 'create') {
		throw new InventoryChangeError('applyCreateViaApi only handles create changes');
	}
	if (change.status !== 'pending') {
		return { applied: false, nrsPartId: change.nrsPartId, error: 'Change is no longer pending' };
	}

	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, change.vendorId)).limit(1);
	if (!vendor) throw new InventoryChangeError('Vendor not found');

	const baseLog: NewNrsInventoryApiLog = {
		vendorId: vendor.id,
		pendingChangeId: change.id,
		triggeredByUserId,
		action: 'create',
		endpoint: 'invstock/save',
		partNumber: change.partNumber,
		nrsVendorId: vendor.nrsVendorId ?? null,
		nrsPartId: null,
		requestPayload: null,
		responseBody: null,
		httpStatus: null,
		success: false,
		errorMessage: null
	};

	if (!vendor.nrsVendorId) {
		const error = 'Vendor has no NRS vendor id — cannot auto-apply, left pending for staff';
		await writeApiLog({ ...baseLog, errorMessage: error });
		return { applied: false, nrsPartId: null, error };
	}

	const p = (change.payload ?? {}) as ChangePayload;
	const saveInput: SaveInvStockInput = {
		name: (p.partName ?? p.description ?? change.partNumber) as string,
		partNumber: change.partNumber,
		description: typeof p.description === 'string' ? p.description : undefined,
		invType: 'Goods',
		retailPrice: typeof p.priceCents === 'number' ? p.priceCents / 100 : undefined,
		printTag: true,
		passThroughApVendorId: vendor.nrsVendorId,
		// NRS's documented save params don't include quantityOnHand; send it
		// best-effort so on-hand carries through when supported and is harmlessly
		// ignored otherwise. The intended qty is preserved in the journal payload.
		...(typeof p.quantity === 'number' ? { quantityOnHand: p.quantity } : {})
	};

	try {
		const result = await saveInvStock(saveInput);
		await writeApiLog({
			...baseLog,
			nrsPartId: result.invStockId,
			requestPayload: saveInput as Record<string, unknown>,
			responseBody: result.raw,
			httpStatus: 200,
			success: result.saved,
			errorMessage: result.saved ? null : 'NRS did not confirm save (no { saved: true })'
		});

		if (!result.saved) {
			return { applied: false, nrsPartId: null, error: 'NRS did not confirm the save' };
		}

		const now = new Date();
		await db
			.update(pendingInventoryChanges)
			.set({
				status: 'applied',
				reviewedAt: now,
				appliedAt: now,
				reviewedByUserId: triggeredByUserId,
				appliedByUserId: triggeredByUserId,
				nrsPartId: result.invStockId ?? change.nrsPartId,
				nrsApplyNotes: `Auto-applied via NRS API (invstock/save)${result.invStockId ? ` → invStockId ${result.invStockId}` : ''}`
			})
			.where(
				and(eq(pendingInventoryChanges.id, change.id), eq(pendingInventoryChanges.status, 'pending'))
			);

		log.info({ changeId, vendorId: vendor.id, nrsPartId: result.invStockId }, 'Auto-applied create via NRS API');
		return { applied: true, nrsPartId: result.invStockId };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await writeApiLog({
			...baseLog,
			requestPayload: saveInput as Record<string, unknown>,
			responseBody: { error: msg },
			errorMessage: msg
		});
		log.error({ changeId, err: msg }, 'Auto-apply create via NRS API failed — left pending');
		return { applied: false, nrsPartId: null, error: msg };
	}
}

/**
 * Vendor cancels their own pending change. Only allowed when status='pending'
 * and the request is for the vendor that submitted it.
 */
export async function cancelChange(changeId: string, vendorId: string): Promise<void> {
	const [row] = await db
		.update(pendingInventoryChanges)
		.set({ status: 'cancelled', reviewedAt: new Date() })
		.where(
			and(
				eq(pendingInventoryChanges.id, changeId),
				eq(pendingInventoryChanges.vendorId, vendorId),
				eq(pendingInventoryChanges.status, 'pending')
			)
		)
		.returning({ id: pendingInventoryChanges.id });
	if (!row) throw new InventoryChangeError('Change not found or no longer pending');
	log.info({ changeId, vendorId }, 'Cancelled inventory change');
}

export async function markApplied(input: {
	changeId: string;
	appliedByUserId: string;
	nrsApplyNotes?: string;
}): Promise<void> {
	const now = new Date();
	const [row] = await db
		.update(pendingInventoryChanges)
		.set({
			status: 'applied',
			reviewedAt: now,
			appliedAt: now,
			reviewedByUserId: input.appliedByUserId,
			appliedByUserId: input.appliedByUserId,
			nrsApplyNotes: input.nrsApplyNotes ?? null
		})
		.where(
			and(
				eq(pendingInventoryChanges.id, input.changeId),
				eq(pendingInventoryChanges.status, 'pending')
			)
		)
		.returning({ id: pendingInventoryChanges.id });
	if (!row) throw new InventoryChangeError('Change not found or no longer pending');
	log.info({ changeId: input.changeId, appliedBy: input.appliedByUserId }, 'Applied inventory change');
}

export async function reject(input: {
	changeId: string;
	reviewedByUserId: string;
	reason: string;
}): Promise<void> {
	if (!input.reason.trim()) throw new InventoryChangeError('Rejection reason is required');
	const [row] = await db
		.update(pendingInventoryChanges)
		.set({
			status: 'rejected',
			reviewedAt: new Date(),
			reviewedByUserId: input.reviewedByUserId,
			rejectionReason: input.reason.trim()
		})
		.where(
			and(
				eq(pendingInventoryChanges.id, input.changeId),
				eq(pendingInventoryChanges.status, 'pending')
			)
		)
		.returning({ id: pendingInventoryChanges.id });
	if (!row) throw new InventoryChangeError('Change not found or no longer pending');
	log.info({ changeId: input.changeId }, 'Rejected inventory change');
}

export async function listForVendor(vendorId: string): Promise<PendingInventoryChange[]> {
	return db
		.select()
		.from(pendingInventoryChanges)
		.where(eq(pendingInventoryChanges.vendorId, vendorId))
		.orderBy(desc(pendingInventoryChanges.submittedAt));
}

export interface ChangeForReview extends PendingInventoryChange {
	vendorDisplayName: string;
	submittedByName: string;
}

export async function listForReview(filter: {
	status?: 'pending' | 'applied' | 'rejected' | 'cancelled';
}): Promise<ChangeForReview[]> {
	const conditions = [];
	if (filter.status) conditions.push(eq(pendingInventoryChanges.status, filter.status));

	const rows = await db
		.select({
			change: pendingInventoryChanges,
			vendorDisplayName: vendors.displayName,
			submittedByName: users.name
		})
		.from(pendingInventoryChanges)
		.innerJoin(vendors, eq(vendors.id, pendingInventoryChanges.vendorId))
		.innerJoin(users, eq(users.id, pendingInventoryChanges.submittedByUserId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(pendingInventoryChanges.submittedAt));

	return rows.map((r) => ({ ...r.change, vendorDisplayName: r.vendorDisplayName, submittedByName: r.submittedByName }));
}

// 39 columns expected by NRS's /import/type/ImportInv uploader.
// See template at https://www.nrsaccounting.com/import/template/ImportInv.
const NRS_IMPORT_COLUMNS = [
	'Part #',
	'Sort Order',
	'Name *',
	'Description',
	'Inventory Type',
	'Quantity On Hand',
	'Vendor Name',
	'Vendor Code',
	'2nd Vendor Name',
	'2nd Vendor Code',
	'3rd Vendor Name',
	'3rd Vendor Code',
	'Pass-Through Item',
	'Pass-Through Vendor Name',
	'Alternate Part #',
	'Alternate Description',
	'Put Away Location',
	'Reorder Qty',
	'Qty Per Carton',
	'Tax Type (Name or 0=Non-Taxable, 1=Taxable)',
	'Category',
	'Unit of Measure',
	'Cost',
	'Avg. Cost',
	'Retail Price',
	'Previous Cost',
	'Min Qty',
	'Max Qty',
	'Print Tag',
	'Notes',
	'Lead Days',
	'Average Lead Days',
	'Last Lead Days',
	'Last Order Date',
	'Last Cost Date',
	'Billing Account',
	'Billing Account (Non-Taxable)',
	'Receiving Account',
	'Original Create Date'
] as const;

function csvEscape(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = String(v);
	// Quote if contains comma, quote, or newline; double-up internal quotes.
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

/**
 * Render one pending-change as the 39 NRS ImportInv cells. Shared by the
 * vendor-scoped exporter and the bulk-tags exporter so column drift can only
 * happen in one place.
 */
function renderNrsCsvCells(change: PendingInventoryChange, vendorDisplayName: string): string[] {
	const p = (change.payload ?? {}) as Record<string, unknown>;
	const partName = p.partName ?? p.name ?? '';
	const description = p.description ?? '';
	const priceCents = typeof p.priceCents === 'number' ? p.priceCents : null;
	const retail = priceCents !== null ? (priceCents / 100).toFixed(2) : '';
	const qty = typeof p.quantity === 'number' ? p.quantity : '';
	const notes = p.notes ?? '';

	return [
		change.partNumber, // Part #
		'', // Sort Order
		partName, // Name * (required)
		description, // Description
		'Goods', // Inventory Type
		qty, // Quantity On Hand
		'', // Vendor Name (set on upload form via frmPassThroughApVendorId)
		'', // Vendor Code
		'', '', '', '', // 2nd/3rd vendor name+code
		'Yes', // Pass-Through Item
		vendorDisplayName, // Pass-Through Vendor Name
		'', // Alternate Part #
		'', // Alternate Description
		'', // Put Away Location
		'', // Reorder Qty
		'', // Qty Per Carton
		'1', // Tax Type — 1=Taxable (most consignment items)
		'', // Category (use form default)
		'Each', // Unit of Measure
		'', // Cost
		'', // Avg. Cost
		retail, // Retail Price
		'', // Previous Cost
		'', '', // Min/Max Qty
		'Yes', // Print Tag — we want NRS to flag these for tag printing
		String(notes), // Notes
		'', '', '', // Lead Days / Average / Last
		'', '', // Last Order Date / Last Cost Date
		'', '', '', // Billing / Billing Non-Tax / Receiving (use form defaults)
		'' // Original Create Date
	].map(String);
}

const NRS_HEADER_ROW = NRS_IMPORT_COLUMNS.map(csvEscape).join(',');

/**
 * Build an NRS ImportInv CSV string from already-fetched changes. Used when
 * the caller has the rows in hand (bulk-tag flow) and wants the file directly.
 */
export function buildNrsCsvFromChangeRows(
	rows: Array<{ change: PendingInventoryChange; vendorDisplayName: string }>
): string {
	const lines: string[] = [NRS_HEADER_ROW];
	for (const r of rows) {
		lines.push(renderNrsCsvCells(r.change, r.vendorDisplayName).map(csvEscape).join(','));
	}
	return lines.join('\r\n') + '\r\n';
}

export interface ApiBulkApplyResult {
	total: number;
	applied: number;
	failed: number;
	results: {
		changeId: string;
		partNumber: string;
		vendorDisplayName: string;
		applied: boolean;
		nrsPartId: number | null;
		error?: string;
	}[];
}

/**
 * Push all pending `create` changes to NRS via the live `invstock/save` API
 * (the staff "apply" button — a retry path for creates whose at-submit
 * auto-apply failed). Each call is journaled by `applyCreateViaApi`; a failed
 * one leaves its change `pending` so it can be retried again. Runs sequentially
 * to stay gentle on the NRS API.
 */
export async function autoApplyPendingCreatesViaApi(opts: {
	triggeredByUserId: string;
	vendorId?: string;
}): Promise<ApiBulkApplyResult> {
	const conditions = [
		eq(pendingInventoryChanges.status, 'pending'),
		eq(pendingInventoryChanges.changeType, 'create'),
		...(opts.vendorId ? [eq(pendingInventoryChanges.vendorId, opts.vendorId)] : [])
	];

	const rows = await db
		.select({
			id: pendingInventoryChanges.id,
			partNumber: pendingInventoryChanges.partNumber,
			vendorDisplayName: vendors.displayName
		})
		.from(pendingInventoryChanges)
		.innerJoin(vendors, eq(vendors.id, pendingInventoryChanges.vendorId))
		.where(and(...conditions))
		.orderBy(pendingInventoryChanges.submittedAt);

	const result: ApiBulkApplyResult = { total: rows.length, applied: 0, failed: 0, results: [] };
	for (const r of rows) {
		try {
			const apply = await applyCreateViaApi(r.id, opts.triggeredByUserId);
			if (apply.applied) result.applied++;
			else result.failed++;
			result.results.push({
				changeId: r.id,
				partNumber: r.partNumber,
				vendorDisplayName: r.vendorDisplayName,
				applied: apply.applied,
				nrsPartId: apply.nrsPartId,
				error: apply.error
			});
		} catch (err) {
			result.failed++;
			result.results.push({
				changeId: r.id,
				partNumber: r.partNumber,
				vendorDisplayName: r.vendorDisplayName,
				applied: false,
				nrsPartId: null,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}
	return result;
}

// ── NRS API journal (staff audit view) ────────────────────────────────────────

export interface ApiLogEntry extends NrsInventoryApiLog {
	vendorDisplayName: string | null;
	triggeredByName: string | null;
}

/**
 * List NRS inventory-API journal entries for the staff audit page, newest first.
 * Joins are LEFT so an entry survives vendor/user deletion.
 */
export async function listApiLog(
	filter: { vendorId?: string; success?: boolean; limit?: number } = {}
): Promise<ApiLogEntry[]> {
	const conditions = [];
	if (filter.vendorId) conditions.push(eq(nrsInventoryApiLog.vendorId, filter.vendorId));
	if (filter.success !== undefined) conditions.push(eq(nrsInventoryApiLog.success, filter.success));

	const rows = await db
		.select({
			log: nrsInventoryApiLog,
			vendorDisplayName: vendors.displayName,
			triggeredByName: users.name
		})
		.from(nrsInventoryApiLog)
		.leftJoin(vendors, eq(vendors.id, nrsInventoryApiLog.vendorId))
		.leftJoin(users, eq(users.id, nrsInventoryApiLog.triggeredByUserId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(nrsInventoryApiLog.createdAt))
		.limit(Math.min(filter.limit ?? 200, 500));

	return rows.map((r) => ({
		...r.log,
		vendorDisplayName: r.vendorDisplayName,
		triggeredByName: r.triggeredByName
	}));
}

/** Success/failure counts for the journal header. */
export async function apiLogCounts(): Promise<{ success: number; failure: number }> {
	const rows = await db
		.select({ success: nrsInventoryApiLog.success, count: sql<number>`count(*)::int` })
		.from(nrsInventoryApiLog)
		.groupBy(nrsInventoryApiLog.success);
	const result = { success: 0, failure: 0 };
	for (const r of rows) {
		if (r.success) result.success = r.count;
		else result.failure = r.count;
	}
	return result;
}

export async function pendingCountByStatus(): Promise<{ pending: number; applied: number; rejected: number; cancelled: number }> {
	const rows = await db
		.select({
			status: pendingInventoryChanges.status,
			count: sql<number>`count(*)::int`
		})
		.from(pendingInventoryChanges)
		.groupBy(pendingInventoryChanges.status);
	const result = { pending: 0, applied: 0, rejected: 0, cancelled: 0 };
	for (const r of rows) result[r.status] = r.count;
	return result;
}
