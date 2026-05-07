/**
 * Pending inventory changes — vendor proposes, staff applies.
 *
 * The vendor portal submits proposed creates/updates/deletes against their
 * NRS inventory. Until we wire NRS write API, every proposal lands here as
 * `status='pending'`; staff reviews `/admin/vendors/inventory-changes`,
 * applies the change manually in NRS, and marks the row `applied`.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
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
