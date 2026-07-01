import { and, eq, desc, inArray, ilike, or } from 'drizzle-orm';
import { db, vendorPrintJobs, vendors } from '$lib/server/db';

/**
 * Print-queue service — the single trust boundary for vendor print jobs.
 *
 * A "Make a tag" in the web vendor portal (with "send to label printer"
 * checked) enqueues a job here. The standalone desktop label app
 * (r0bug/yakima-label) polls `GET /api/vendor/print-queue`, prints over USB,
 * then acks via `POST /api/vendor/print-queue/:id/ack`.
 *
 * Every function takes `vendorId` and uses it in the WHERE clause — endpoint
 * code passes the authenticated vendor's id and never trusts request data, so
 * one vendor can never read or ack another vendor's jobs.
 */
export class PrintQueueError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PrintQueueError';
	}
}

export interface EnqueuePrintJobInput {
	vendorId: string;
	partNumber: string;
	copies?: number;
	description?: string | null;
	priceCents?: number | null;
	source?: string;
	pendingChangeId?: string | null;
	createdByUserId?: string | null;
}

export async function enqueuePrintJob(input: EnqueuePrintJobInput) {
	const partNumber = input.partNumber?.trim();
	if (!partNumber) throw new PrintQueueError('partNumber is required');

	// Clamp to a sane positive count; default 1.
	const copies = input.copies && input.copies > 0 ? Math.floor(input.copies) : 1;

	const [row] = await db
		.insert(vendorPrintJobs)
		.values({
			vendorId: input.vendorId,
			partNumber,
			copies,
			description: input.description ?? null,
			priceCents: input.priceCents ?? null,
			source: input.source ?? 'web_portal',
			pendingChangeId: input.pendingChangeId ?? null,
			createdByUserId: input.createdByUserId ?? null
		})
		.returning();
	return row;
}

/**
 * A vendor's full print history (every status, not just queued). Optional
 * case-insensitive substring filter on partNumber OR description. Newest first.
 * Vendor-scoped — callers pass the authenticated vendor's id. limit default 100,
 * clamped 1..500.
 */
export async function listHistoryForVendor(
	vendorId: string,
	opts: { q?: string; limit?: number } = {}
) {
	const limit = Math.max(1, Math.min(500, opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : 100));
	const q = opts.q?.trim();

	const conditions = [eq(vendorPrintJobs.vendorId, vendorId)];
	if (q) {
		const pattern = `%${q}%`;
		conditions.push(
			or(ilike(vendorPrintJobs.partNumber, pattern), ilike(vendorPrintJobs.description, pattern))!
		);
	}

	return db
		.select()
		.from(vendorPrintJobs)
		.where(and(...conditions))
		.orderBy(desc(vendorPrintJobs.createdAt))
		.limit(limit);
}

/**
 * Record a tag that staff printed immediately client-side (via the admin
 * tag-zpl endpoint) so it still lands in the vendor's print history. Inserts a
 * row already marked printed (status 'printed', printedAt now, source 'staff') —
 * unlike enqueuePrintJob, nothing polls or acks it. Mirrors enqueuePrintJob's
 * validation: partNumber required, copies clamped to >=1 (default 1).
 */
export async function recordStaffPrintedJob(input: {
	vendorId: string;
	partNumber: string;
	copies?: number;
	description?: string | null;
	priceCents?: number | null;
	createdByUserId?: string | null;
}) {
	const partNumber = input.partNumber?.trim();
	if (!partNumber) throw new PrintQueueError('partNumber is required');

	const copies = input.copies && input.copies > 0 ? Math.floor(input.copies) : 1;

	const [row] = await db
		.insert(vendorPrintJobs)
		.values({
			vendorId: input.vendorId,
			partNumber,
			copies,
			description: input.description ?? null,
			priceCents: input.priceCents ?? null,
			source: 'staff',
			status: 'printed',
			printedAt: new Date(),
			createdByUserId: input.createdByUserId ?? null
		})
		.returning();
	return row;
}

export async function listQueuedForVendor(vendorId: string) {
	return db
		.select()
		.from(vendorPrintJobs)
		.where(and(eq(vendorPrintJobs.vendorId, vendorId), eq(vendorPrintJobs.status, 'queued')))
		.orderBy(desc(vendorPrintJobs.createdAt));
}

/**
 * Staff/admin view: every vendor's waiting-to-print jobs (status='queued'),
 * joined to the vendor display name. NOT vendor-scoped — callers must be staff.
 */
export async function listQueuedAcrossVendors() {
	return db
		.select({
			id: vendorPrintJobs.id,
			vendorId: vendorPrintJobs.vendorId,
			vendorName: vendors.displayName,
			vendorPrefix: vendors.inventoryCodePrefix,
			partNumber: vendorPrintJobs.partNumber,
			copies: vendorPrintJobs.copies,
			description: vendorPrintJobs.description,
			priceCents: vendorPrintJobs.priceCents,
			source: vendorPrintJobs.source,
			createdAt: vendorPrintJobs.createdAt
		})
		.from(vendorPrintJobs)
		.innerJoin(vendors, eq(vendors.id, vendorPrintJobs.vendorId))
		.where(eq(vendorPrintJobs.status, 'queued'))
		.orderBy(desc(vendorPrintJobs.createdAt));
}

export async function ackPrintJob(
	jobId: string,
	vendorId: string,
	outcome: { status: 'printed' | 'failed'; failureReason?: string | null }
) {
	if (outcome.status !== 'printed' && outcome.status !== 'failed') {
		throw new PrintQueueError('status must be "printed" or "failed"');
	}

	const [row] = await db
		.update(vendorPrintJobs)
		.set({
			status: outcome.status,
			printedAt: outcome.status === 'printed' ? new Date() : null,
			failureReason: outcome.status === 'failed' ? (outcome.failureReason ?? null) : null
		})
		.where(and(eq(vendorPrintJobs.id, jobId), eq(vendorPrintJobs.vendorId, vendorId)))
		.returning();

	// Null means no row matched the (id, vendorId) pair — either it doesn't
	// exist or it belongs to another vendor. Same 404 either way (no enumeration).
	if (!row) throw new PrintQueueError('Print job not found');
	return row;
}

/**
 * Batch variant of ackPrintJob — mark many of the vendor's jobs printed/failed
 * in one UPDATE. Vendor-scoped: the WHERE also matches vendorId, so a vendor can
 * never ack another vendor's jobs (unmatched ids are silently ignored). Returns
 * the rows that were actually updated. Empty input is a no-op returning [].
 */
export async function batchAckPrintJobs(
	jobIds: string[],
	vendorId: string,
	outcome: { status: 'printed' | 'failed'; failureReason?: string | null }
) {
	if (outcome.status !== 'printed' && outcome.status !== 'failed') {
		throw new PrintQueueError('status must be "printed" or "failed"');
	}
	if (jobIds.length === 0) return [];

	return db
		.update(vendorPrintJobs)
		.set({
			status: outcome.status,
			printedAt: outcome.status === 'printed' ? new Date() : null,
			failureReason: outcome.status === 'failed' ? (outcome.failureReason ?? null) : null
		})
		.where(and(inArray(vendorPrintJobs.id, jobIds), eq(vendorPrintJobs.vendorId, vendorId)))
		.returning();
}

/**
 * Manager-gated batch ack of any vendor's jobs (store/admin mode). NOT
 * vendor-scoped — the caller must already be authorized as a manager. Returns
 * the rows that were updated. Empty input is a no-op returning [].
 */
export async function batchAdminAckPrintJobs(
	jobIds: string[],
	outcome: { status: 'printed' | 'failed'; failureReason?: string | null }
) {
	if (outcome.status !== 'printed' && outcome.status !== 'failed') {
		throw new PrintQueueError('status must be "printed" or "failed"');
	}
	if (jobIds.length === 0) return [];

	return db
		.update(vendorPrintJobs)
		.set({
			status: outcome.status,
			printedAt: outcome.status === 'printed' ? new Date() : null,
			failureReason: outcome.status === 'failed' ? (outcome.failureReason ?? null) : null
		})
		.where(inArray(vendorPrintJobs.id, jobIds))
		.returning();
}

/**
 * Manager-gated ack of any vendor's job (store/admin mode). The caller must
 * already be authorized as a manager — this is not vendor-scoped.
 */
export async function adminAckPrintJob(
	jobId: string,
	outcome: { status: 'printed' | 'failed'; failureReason?: string | null }
) {
	if (outcome.status !== 'printed' && outcome.status !== 'failed') {
		throw new PrintQueueError('status must be "printed" or "failed"');
	}
	const [row] = await db
		.update(vendorPrintJobs)
		.set({
			status: outcome.status,
			printedAt: outcome.status === 'printed' ? new Date() : null,
			failureReason: outcome.status === 'failed' ? (outcome.failureReason ?? null) : null
		})
		.where(eq(vendorPrintJobs.id, jobId))
		.returning();
	if (!row) throw new PrintQueueError('Print job not found');
	return row;
}

/**
 * Atomically lease a queued job (queued → claimed) so two drainers (e.g. a
 * vendor's home app and the store) can't both print it. Returns the row on a
 * win, or null if it wasn't `queued` (already claimed/printed) — the caller
 * should treat null as "someone else got it".
 */
export async function claimPrintJob(jobId: string) {
	const [row] = await db
		.update(vendorPrintJobs)
		.set({ status: 'claimed' })
		.where(and(eq(vendorPrintJobs.id, jobId), eq(vendorPrintJobs.status, 'queued')))
		.returning();
	return row ?? null;
}
