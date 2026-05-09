/**
 * Pending inventory changes — vendor proposes, staff applies.
 *
 * The vendor portal submits proposed creates/updates/deletes against their
 * NRS inventory. Until we wire NRS write API, every proposal lands here as
 * `status='pending'`; staff reviews `/admin/vendors/inventory-changes`,
 * applies the change manually in NRS, and marks the row `applied`.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	pendingInventoryChanges,
	vendors,
	users,
	type PendingInventoryChange
} from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:inventory-change');

export class InventoryChangeError extends Error {}

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

	if ((input.changeType === 'update' || input.changeType === 'delete') && !input.nrsPartId) {
		throw new InventoryChangeError(`${input.changeType} change requires an nrsPartId`);
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

export interface NrsImportCsvOptions {
	/** Optional: only export rows for one vendor (TT vendorId). */
	vendorId?: string;
	/** Optional: only this change type (default: 'create' since NRS Importer is for adding new inventory). */
	changeType?: 'create' | 'update' | 'delete';
}

export interface NrsImportCsvResult {
	csv: string;
	rowCount: number;
	changeIds: string[];
	vendorName: string | null;
	vendorCode: string | null;
}

/**
 * Build a CSV that matches the NRS ImportInv template, sourced from pending
 * inventory changes (status='pending'). Only `create` changes by default —
 * NRS's Importer adds new items, it doesn't update existing ones.
 *
 * The result string is RFC 4180-style CSV with CRLF line endings.
 */
export async function buildNrsImportCsv(opts: NrsImportCsvOptions = {}): Promise<NrsImportCsvResult> {
	const changeType = opts.changeType ?? 'create';
	const conditions = [
		eq(pendingInventoryChanges.status, 'pending'),
		eq(pendingInventoryChanges.changeType, changeType)
	];
	if (opts.vendorId) conditions.push(eq(pendingInventoryChanges.vendorId, opts.vendorId));

	const rows = await db
		.select({
			change: pendingInventoryChanges,
			vendorDisplayName: vendors.displayName,
			vendorCode: vendors.inventoryCodePrefix
		})
		.from(pendingInventoryChanges)
		.innerJoin(vendors, eq(vendors.id, pendingInventoryChanges.vendorId))
		.where(and(...conditions))
		.orderBy(pendingInventoryChanges.submittedAt);

	const lines: string[] = [NRS_IMPORT_COLUMNS.map(csvEscape).join(',')];
	const changeIds: string[] = [];
	let vendorName: string | null = null;
	let vendorCode: string | null = null;

	for (const r of rows) {
		const c = r.change;
		const p = (c.payload ?? {}) as Record<string, unknown>;
		// When the export is scoped to one vendor, surface that vendor's name/code
		// in the result for the "you're about to import for X" UI banner.
		if (opts.vendorId) {
			vendorName = r.vendorDisplayName;
			vendorCode = r.vendorCode;
		}

		const partName = p.partName ?? p.name ?? '';
		const description = p.description ?? '';
		const priceCents = typeof p.priceCents === 'number' ? p.priceCents : null;
		const retail = priceCents !== null ? (priceCents / 100).toFixed(2) : '';
		const qty = typeof p.quantity === 'number' ? p.quantity : '';
		const notes = p.notes ?? '';

		// One row per change. Defaults are conservative: leave GL/category/tax
		// blank so the upload-form picker fills them in. Print Tag = Yes,
		// Pass-Through Item = Yes, Inventory Type = Goods.
		const cells = [
			c.partNumber, // Part #
			'', // Sort Order
			partName, // Name * (required)
			description, // Description
			'Goods', // Inventory Type
			qty, // Quantity On Hand
			'', // Vendor Name (set on upload form via frmPassThroughApVendorId)
			'', // Vendor Code
			'', '', '', '', // 2nd/3rd vendor name+code
			'Yes', // Pass-Through Item
			r.vendorDisplayName, // Pass-Through Vendor Name
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
			notes, // Notes
			'', '', '', // Lead Days / Average / Last
			'', '', // Last Order Date / Last Cost Date
			'', '', '', // Billing / Billing Non-Tax / Receiving (use form defaults)
			'' // Original Create Date
		];

		lines.push(cells.map(csvEscape).join(','));
		changeIds.push(c.id);
	}

	return {
		csv: lines.join('\r\n') + '\r\n',
		rowCount: rows.length,
		changeIds,
		vendorName,
		vendorCode
	};
}

export interface AutoImportResult {
	vendorId: string;
	vendorDisplayName: string;
	vendorNrsId: number | null;
	rowCount: number;
	ok: boolean;
	messages: string[];
	error?: string;
	appliedChangeIds: string[];
	fileId?: number;
}

/**
 * Apply all pending `create` changes by feeding them to the NRS Importer
 * web UI (login → upload CSV → submit form). Groups by vendor since the
 * importer scopes to one pass-through vendor per submission.
 *
 * On success, marks the matched changes as `applied` with a notes line
 * referencing the NRS file id.
 *
 * Failures bubble per-vendor — one bad batch doesn't block the others.
 */
export async function autoApplyPendingViaImporter(opts: {
	appliedByUserId: string;
	vendorId?: string; // optional: limit to a single vendor
}): Promise<AutoImportResult[]> {
	const { buildNrsImportCsv } = await import('./inventory-change-service');
	const { applyCsvViaNrsImporter } = await import('./nrs-importer-client');

	// Find vendors with pending creates (optionally scoped)
	const pendingByVendor = await db
		.select({
			vendorId: pendingInventoryChanges.vendorId,
			vendorDisplayName: vendors.displayName,
			vendorNrsId: vendors.nrsVendorId,
			vendorCode: vendors.inventoryCodePrefix,
			count: sql<number>`count(*)::int`
		})
		.from(pendingInventoryChanges)
		.innerJoin(vendors, eq(vendors.id, pendingInventoryChanges.vendorId))
		.where(
			and(
				eq(pendingInventoryChanges.status, 'pending'),
				eq(pendingInventoryChanges.changeType, 'create'),
				...(opts.vendorId ? [eq(pendingInventoryChanges.vendorId, opts.vendorId)] : [])
			)
		)
		.groupBy(vendors.id, pendingInventoryChanges.vendorId, vendors.displayName, vendors.nrsVendorId, vendors.inventoryCodePrefix);

	const results: AutoImportResult[] = [];
	for (const v of pendingByVendor) {
		const base: AutoImportResult = {
			vendorId: v.vendorId,
			vendorDisplayName: v.vendorDisplayName,
			vendorNrsId: v.vendorNrsId,
			rowCount: v.count,
			ok: false,
			messages: [],
			appliedChangeIds: []
		};
		if (!v.vendorNrsId) {
			base.error = 'Vendor has no NRS vendor id';
			results.push(base);
			continue;
		}

		try {
			// Build the CSV for just this vendor
			const csvResult = await buildNrsImportCsv({ vendorId: v.vendorId, changeType: 'create' });
			if (csvResult.rowCount === 0) {
				base.error = 'No rows to import';
				results.push(base);
				continue;
			}

			const today = new Date().toISOString().slice(0, 10);
			const filename = `tt-${v.vendorCode ?? 'vendor'}-${today}.csv`;

			const importResult = await applyCsvViaNrsImporter({
				csv: csvResult.csv,
				filename,
				passThroughApVendorId: v.vendorNrsId
			});

			base.ok = importResult.ok;
			base.messages = importResult.messages;
			base.fileId = importResult.fileId;

			if (importResult.ok && csvResult.changeIds.length > 0) {
				const appliedAt = new Date();
				const notes = `Auto-applied via NRS Importer (file #${importResult.fileId})${importResult.messages.length ? ': ' + importResult.messages.join(' / ') : ''}`;
				await db
					.update(pendingInventoryChanges)
					.set({
						status: 'applied',
						reviewedAt: appliedAt,
						appliedAt,
						reviewedByUserId: opts.appliedByUserId,
						appliedByUserId: opts.appliedByUserId,
						nrsApplyNotes: notes
					})
					.where(
						and(
							inArray(pendingInventoryChanges.id, csvResult.changeIds),
							eq(pendingInventoryChanges.status, 'pending')
						)
					);
				base.appliedChangeIds = csvResult.changeIds;
			}
		} catch (err) {
			base.error = err instanceof Error ? err.message : String(err);
			log.error({ vendorId: v.vendorId, err }, 'Auto-import failed for vendor');
		}
		results.push(base);
	}

	return results;
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
