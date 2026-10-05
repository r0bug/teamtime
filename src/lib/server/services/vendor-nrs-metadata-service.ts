/**
 * Vendor ↔ NRS metadata service.
 *
 * NRS exposes four custom vendor metadata fields (see NRS_VENDOR_META):
 *   meta13 Booth Rent, meta72 Booth Details, meta73 Booth Size and Location,
 *   meta74 Display in Teamtime Floorplan.
 *
 * Ownership:
 *  - Booth Rent: editable from TeamTime by managers only. A change is pushed
 *    to NRS first and only mirrored into `vendors.monthly_rent_cents` once NRS
 *    confirms, so the two never disagree because of a failed push. Rent edited
 *    directly in NRS is picked up by `syncFromNrs` (source 'nrs_sync').
 *  - Booth Details / Size & Location / Display flag: TeamTime's floorplan is
 *    the source of truth. TeamTime renders them from the cell store and
 *    pushes whenever the floorplan, pools, or booth number change, and on
 *    every NRS sync.
 *
 * Every write (and every rent change mirrored from NRS) is recorded in
 * `vendor_nrs_metadata_log` with the acting user when there is one.
 */

import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db, vendors, users, vendorNrsMetadataLog, type Vendor } from '$lib/server/db';
import {
	getVendorDetail,
	saveVendorMeta,
	metaText,
	rentCentsFromMeta,
	NRS_VENDOR_META,
	type NrsVendorDetail
} from './nrs-api-client';
import { computeBoothSummaries, formatBoothMeta, type BoothSummary, type BoothMetaValues } from '$lib/server/floorplan/booth-summary';
import { audit } from './audit-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor-nrs-metadata');

export type MetaLogSource = 'rent_edit' | 'floorplan_push' | 'nrs_sync';

type VendorForMeta = Pick<Vendor, 'id' | 'nrsVendorId' | 'boothNumber' | 'displayName'>;

export class VendorRentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VendorRentError';
	}
}

async function writeLog(entry: {
	vendorId: string | null;
	nrsVendorId: number;
	changedByUserId?: string | null;
	source: MetaLogSource;
	fields: string[];
	beforeData?: Record<string, unknown> | null;
	afterData?: Record<string, unknown> | null;
	responseBody?: Record<string, unknown> | null;
	success: boolean;
	errorMessage?: string | null;
}): Promise<void> {
	try {
		await db.insert(vendorNrsMetadataLog).values({
			vendorId: entry.vendorId,
			nrsVendorId: entry.nrsVendorId,
			changedByUserId: entry.changedByUserId ?? null,
			source: entry.source,
			fields: entry.fields,
			beforeData: entry.beforeData ?? null,
			afterData: entry.afterData ?? null,
			responseBody: entry.responseBody ?? null,
			success: entry.success,
			errorMessage: entry.errorMessage ?? null
		});
	} catch (err) {
		// The log must never take down the operation it describes.
		log.error({ err, entry: { ...entry, responseBody: undefined } }, 'failed to write vendor_nrs_metadata_log');
	}
}

// ── Booth rent ──────────────────────────────────────────────────────────────

/**
 * Set a vendor's monthly rent from TeamTime (manager action; the route
 * enforces the role and the confirmation popup, this records who did it).
 *
 * Pushes meta13 to NRS first. If NRS rejects or is unreachable the TT value
 * is left untouched and a failed log row is written, then VendorRentError is
 * thrown so the UI can say "not saved". Vendors without an NRS link only
 * update locally (nothing to push).
 */
export async function setVendorRent(input: {
	vendorId: string;
	monthlyRentCents: number | null;
	userId: string;
}): Promise<{ vendor: Vendor; pushedToNrs: boolean; changed: boolean }> {
	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
	if (!vendor) throw new VendorRentError('Vendor not found');

	const next = input.monthlyRentCents !== null && input.monthlyRentCents > 0 ? Math.round(input.monthlyRentCents) : null;
	const before = vendor.monthlyRentCents ?? null;
	if (before === next) return { vendor, pushedToNrs: false, changed: false };

	let pushedToNrs = false;
	let responseBody: Record<string, unknown> | null = null;

	if (vendor.nrsVendorId !== null) {
		try {
			const result = await saveVendorMeta(vendor.nrsVendorId, { meta13: next !== null ? next / 100 : 0 });
			responseBody = result.raw;
			const confirmed = rentCentsFromMeta(result.detail);
			if (confirmed !== next) {
				throw new Error(`NRS stored ${confirmed ?? 0} cents, expected ${next ?? 0}`);
			}
			pushedToNrs = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await writeLog({
				vendorId: vendor.id,
				nrsVendorId: vendor.nrsVendorId,
				changedByUserId: input.userId,
				source: 'rent_edit',
				fields: [NRS_VENDOR_META.boothRent],
				beforeData: { monthlyRentCents: before },
				afterData: { monthlyRentCents: next },
				responseBody,
				success: false,
				errorMessage: message
			});
			log.error({ vendorId: vendor.id, nrsVendorId: vendor.nrsVendorId, err: message }, 'rent push to NRS failed');
			throw new VendorRentError(`Rent was NOT changed — NRS did not accept the update (${message}). Try again.`);
		}
	}

	const [updated] = await db
		.update(vendors)
		.set({ monthlyRentCents: next, updatedAt: new Date() })
		.where(eq(vendors.id, vendor.id))
		.returning();

	await writeLog({
		vendorId: vendor.id,
		nrsVendorId: vendor.nrsVendorId ?? 0,
		changedByUserId: input.userId,
		source: 'rent_edit',
		fields: [NRS_VENDOR_META.boothRent],
		beforeData: { monthlyRentCents: before },
		afterData: { monthlyRentCents: next, pushedToNrs },
		responseBody,
		success: true
	});
	await audit({
		userId: input.userId,
		action: 'vendor.rent_changed',
		entityType: 'vendor',
		entityId: vendor.id,
		beforeData: { monthlyRentCents: before },
		afterData: { monthlyRentCents: next, pushedToNrs }
	});
	log.info({ vendorId: vendor.id, before, next, pushedToNrs, userId: input.userId }, 'vendor rent changed');

	return { vendor: updated, pushedToNrs, changed: true };
}

/**
 * Mirror a rent value NRS holds into TT during sync. Returns the cents to
 * store (or undefined for "no change"). Logs the change so the history on
 * the vendor page shows NRS-side edits too.
 */
export async function mirrorRentFromNrs(
	vendor: Pick<Vendor, 'id' | 'nrsVendorId' | 'monthlyRentCents'>,
	detail: Pick<NrsVendorDetail, 'meta13'>
): Promise<number | null | undefined> {
	const nrsCents = rentCentsFromMeta(detail);
	// NRS is authoritative when it has a value. A blank in NRS does not wipe
	// TT (protects legacy rows until a manager clears them explicitly).
	if (nrsCents === null || nrsCents === (vendor.monthlyRentCents ?? null)) return undefined;
	await writeLog({
		vendorId: vendor.id,
		nrsVendorId: vendor.nrsVendorId ?? 0,
		source: 'nrs_sync',
		fields: [NRS_VENDOR_META.boothRent],
		beforeData: { monthlyRentCents: vendor.monthlyRentCents ?? null },
		afterData: { monthlyRentCents: nrsCents },
		success: true
	});
	return nrsCents;
}

// ── Booth details / floorplan ───────────────────────────────────────────────

export type BoothPushOutcome = 'pushed' | 'unchanged' | 'failed' | 'unlinked' | 'disabled';

/** The values TeamTime wants NRS to hold for this vendor right now. */
export function desiredBoothMeta(vendor: Pick<Vendor, 'nrsVendorId' | 'boothNumber'>, summaries: Map<string, BoothSummary>): BoothMetaValues {
	const summary = vendor.nrsVendorId !== null ? summaries.get(String(vendor.nrsVendorId)) : undefined;
	return formatBoothMeta(summary, vendor);
}

function boothMetaDiffers(detail: NrsVendorDetail, want: BoothMetaValues): boolean {
	return (
		(metaText(detail.meta72) ?? '') !== want.meta72 ||
		(metaText(detail.meta73) ?? '') !== want.meta73 ||
		Boolean(detail.meta74) !== want.meta74
	);
}

/**
 * Reconcile one vendor's booth metadata in NRS against the floorplan.
 * Pure-ish: caller supplies the current NRS detail (sync already has it) and
 * the precomputed summaries; this only writes when something differs.
 */
export async function reconcileBoothMeta(
	vendor: VendorForMeta,
	detail: NrsVendorDetail,
	summaries: Map<string, BoothSummary>,
	changedByUserId: string | null = null
): Promise<BoothPushOutcome> {
	if (vendor.nrsVendorId === null) return 'unlinked';
	const want = desiredBoothMeta(vendor, summaries);
	if (!boothMetaDiffers(detail, want)) return 'unchanged';

	const beforeData = { meta72: metaText(detail.meta72), meta73: metaText(detail.meta73), meta74: Boolean(detail.meta74) };
	const afterData = { meta72: want.meta72 || null, meta73: want.meta73 || null, meta74: want.meta74 };
	const fields = [NRS_VENDOR_META.boothDetails, NRS_VENDOR_META.boothSizeLocation, NRS_VENDOR_META.showInFloorplan];

	try {
		const result = await saveVendorMeta(vendor.nrsVendorId, want);
		if (boothMetaDiffers(result.detail, want)) {
			throw new Error('NRS re-read does not match what was sent');
		}
		await writeLog({
			vendorId: vendor.id,
			nrsVendorId: vendor.nrsVendorId,
			changedByUserId,
			source: 'floorplan_push',
			fields,
			beforeData,
			afterData,
			responseBody: result.raw,
			success: true
		});
		log.info({ vendorId: vendor.id, nrsVendorId: vendor.nrsVendorId, onFloor: want.meta74 }, 'booth metadata pushed to NRS');
		return 'pushed';
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await writeLog({
			vendorId: vendor.id,
			nrsVendorId: vendor.nrsVendorId,
			changedByUserId,
			source: 'floorplan_push',
			fields,
			beforeData,
			afterData,
			success: false,
			errorMessage: message
		});
		log.warn({ vendorId: vendor.id, nrsVendorId: vendor.nrsVendorId, err: message }, 'booth metadata push failed');
		return 'failed';
	}
}

export interface BoothPushResult {
	checked: number;
	pushed: number;
	unchanged: number;
	failed: number;
	/** Would have pushed, but NRS writes are switched off. */
	disabled: number;
}

/**
 * Push booth metadata for specific NRS vendor ids (after a floorplan paint,
 * a pool edit, or a booth-number change). Unknown ids are skipped — only
 * vendors TeamTime tracks get written.
 */
export async function pushBoothMetaForNrsVendors(
	nrsVendorIds: (number | string)[],
	changedByUserId: string | null = null
): Promise<BoothPushResult> {
	const ids = [...new Set(nrsVendorIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
	const result: BoothPushResult = { checked: 0, pushed: 0, unchanged: 0, failed: 0, disabled: 0 };
	if (ids.length === 0) return result;

	const rows = await db
		.select({ id: vendors.id, nrsVendorId: vendors.nrsVendorId, boothNumber: vendors.boothNumber, displayName: vendors.displayName })
		.from(vendors)
		.where(inArray(vendors.nrsVendorId, ids));
	if (rows.length === 0) return result;

	const summaries = await computeBoothSummaries();
	for (const v of rows) {
		result.checked++;
		let detail: NrsVendorDetail | null = null;
		try {
			detail = await getVendorDetail(v.nrsVendorId!);
		} catch (err) {
			log.warn({ nrsVendorId: v.nrsVendorId, err: String(err) }, 'vendor/get failed during booth push');
		}
		if (!detail) {
			result.failed++;
			continue;
		}
		const outcome = await reconcileBoothMeta(v, detail, summaries, changedByUserId);
		if (outcome === 'pushed') result.pushed++;
		else if (outcome === 'failed') result.failed++;
		else if (outcome === 'disabled') result.disabled++;
		else result.unchanged++;
	}
	return result;
}

/** Push booth metadata for every NRS-linked vendor TeamTime tracks. */
export async function pushAllBoothMeta(changedByUserId: string | null = null): Promise<BoothPushResult> {
	const rows = await db
		.select({ nrsVendorId: vendors.nrsVendorId })
		.from(vendors)
		.where(sql`${vendors.nrsVendorId} IS NOT NULL`);
	return pushBoothMetaForNrsVendors(rows.map((r) => r.nrsVendorId!), changedByUserId);
}

// ── History ─────────────────────────────────────────────────────────────────

export interface VendorMetaLogRow {
	id: string;
	source: MetaLogSource;
	fields: string[];
	beforeData: Record<string, unknown> | null;
	afterData: Record<string, unknown> | null;
	success: boolean;
	errorMessage: string | null;
	createdAt: Date;
	changedBy: { id: string; name: string } | null;
}

export async function listVendorMetaLog(vendorId: string, limit = 50): Promise<VendorMetaLogRow[]> {
	const rows = await db
		.select({
			id: vendorNrsMetadataLog.id,
			source: vendorNrsMetadataLog.source,
			fields: vendorNrsMetadataLog.fields,
			beforeData: vendorNrsMetadataLog.beforeData,
			afterData: vendorNrsMetadataLog.afterData,
			success: vendorNrsMetadataLog.success,
			errorMessage: vendorNrsMetadataLog.errorMessage,
			createdAt: vendorNrsMetadataLog.createdAt,
			userId: users.id,
			userName: users.name
		})
		.from(vendorNrsMetadataLog)
		.leftJoin(users, eq(users.id, vendorNrsMetadataLog.changedByUserId))
		.where(eq(vendorNrsMetadataLog.vendorId, vendorId))
		.orderBy(desc(vendorNrsMetadataLog.createdAt))
		.limit(limit);
	return rows.map((r) => ({
		id: r.id,
		source: r.source as MetaLogSource,
		fields: r.fields,
		beforeData: r.beforeData,
		afterData: r.afterData,
		success: r.success,
		errorMessage: r.errorMessage,
		createdAt: r.createdAt,
		changedBy: r.userId ? { id: r.userId, name: r.userName ?? '' } : null
	}));
}
