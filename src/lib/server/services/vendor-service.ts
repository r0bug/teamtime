/**
 * Vendor service — CRUD, NRS sync, and agreement signing.
 *
 * NRS is the source of truth for vendor identity, sales, commissions, and
 * inventory. TeamTime stores TT-specific fields (contract terms, contact info,
 * signed agreements, notes) keyed off `nrsVendorId`.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { db } from '$lib/server/db';
import {
	vendors,
	vendorAgreements,
	agreementTemplates,
	salesTransactions,
	users,
	userTypes,
	vendorGroupMembers,
	vendorGroups,
	vendorPartnumberSequences,
	type Vendor,
	type NewVendor,
	type VendorAgreement,
	type AgreementTemplate,
	type VendorGroup
} from '$lib/server/db/schema';
import { getVendors as fetchNrsVendors, getVendorDetail, type NrsVendorDetail } from './nrs-api-client';
import { hashPin } from '$lib/server/auth/pin';
import { sendVendorPortalInvitationEmail } from '$lib/server/email';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor');

export interface VendorListItem extends Vendor {
	primaryAgreement: { id: string; signedAt: Date; templateTitle: string } | null;
	activeAddonCount: number;
}

export async function listVendors(filters?: {
	status?: 'active' | 'inactive' | 'terminated';
	search?: string;
	includeNrsInactive?: boolean;
}): Promise<VendorListItem[]> {
	const conditions = [];
	if (filters?.status) conditions.push(eq(vendors.status, filters.status));
	// Hide NRS-inactive vendors by default. Caller can opt in with includeNrsInactive=true.
	if (!filters?.includeNrsInactive) conditions.push(eq(vendors.nrsInactive, false));

	const rows = await db
		.select()
		.from(vendors)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(vendors.displayName);

	const filtered = filters?.search
		? rows.filter((v) => {
				const q = filters.search!.toLowerCase();
				return (
					v.displayName.toLowerCase().includes(q) ||
					(v.boothNumber?.toLowerCase().includes(q) ?? false) ||
					(v.contactName?.toLowerCase().includes(q) ?? false)
				);
		  })
		: rows;

	const ids = filtered.map((v) => v.id);
	if (ids.length === 0) return [];

	const allSigned = await db
		.select({
			id: vendorAgreements.id,
			vendorId: vendorAgreements.vendorId,
			templateId: vendorAgreements.templateId,
			signedAt: vendorAgreements.signedAt,
			templateTitle: agreementTemplates.title,
			templateKind: agreementTemplates.kind
		})
		.from(vendorAgreements)
		.innerJoin(agreementTemplates, eq(agreementTemplates.id, vendorAgreements.templateId))
		.where(
			and(
				eq(vendorAgreements.status, 'signed'),
				inArray(vendorAgreements.vendorId, ids)
			)
		);

	const byVendor = new Map<string, typeof allSigned>();
	for (const row of allSigned) {
		const list = byVendor.get(row.vendorId) ?? [];
		list.push(row);
		byVendor.set(row.vendorId, list);
	}

	return filtered.map((v) => {
		const signed = byVendor.get(v.id) ?? [];
		const primary = signed.find((s) => s.templateKind === 'primary');
		const addons = signed.filter((s) => s.templateKind === 'addon');
		return {
			...v,
			primaryAgreement: primary
				? { id: primary.id, signedAt: primary.signedAt, templateTitle: primary.templateTitle }
				: null,
			activeAddonCount: addons.length
		};
	});
}

export async function getVendor(id: string): Promise<Vendor | null> {
	const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
	return row ?? null;
}

export async function getVendorAgreements(vendorId: string): Promise<
	(VendorAgreement & { template: AgreementTemplate })[]
> {
	const rows = await db
		.select()
		.from(vendorAgreements)
		.innerJoin(agreementTemplates, eq(agreementTemplates.id, vendorAgreements.templateId))
		.where(eq(vendorAgreements.vendorId, vendorId))
		.orderBy(desc(vendorAgreements.signedAt));

	return rows.map((r) => ({ ...r.vendor_agreements, template: r.agreement_templates }));
}

export async function createVendor(
	input: Omit<NewVendor, 'id' | 'createdAt' | 'updatedAt'>,
	createdByUserId?: string
): Promise<Vendor> {
	const [row] = await db
		.insert(vendors)
		.values({ ...input, createdByUserId: createdByUserId ?? null })
		.returning();
	log.info({ vendorId: row.id, displayName: row.displayName }, 'Created vendor');
	return row;
}

export async function updateVendor(
	id: string,
	patch: Partial<Omit<NewVendor, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Vendor> {
	const [row] = await db
		.update(vendors)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(vendors.id, id))
		.returning();
	if (!row) throw new Error(`Vendor not found: ${id}`);
	return row;
}

/**
 * Sign an agreement. Voids any prior `signed` row for the same
 * (vendorId, templateId) pair as `superseded`. Other agreements on this
 * vendor (different templates) are untouched — that's what lets a vendor
 * stack one primary + N add-ons simultaneously.
 */
export async function signAgreement(input: {
	vendorId: string;
	templateId: string;
	signedByName: string;
	signatureDataUrl: string | null;
	paperOriginalOnFile: boolean;
	extraFieldValues?: Record<string, string | number | null>;
	witnessedByUserId?: string;
}): Promise<VendorAgreement> {
	return db.transaction(async (tx) => {
		const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
		if (!vendor) throw new Error(`Vendor not found: ${input.vendorId}`);

		const [template] = await tx
			.select()
			.from(agreementTemplates)
			.where(eq(agreementTemplates.id, input.templateId))
			.limit(1);
		if (!template) throw new Error(`Template not found: ${input.templateId}`);

		await tx
			.update(vendorAgreements)
			.set({ status: 'voided', voidedAt: new Date(), voidedReason: 'superseded' })
			.where(
				and(
					eq(vendorAgreements.vendorId, input.vendorId),
					eq(vendorAgreements.templateId, input.templateId),
					eq(vendorAgreements.status, 'signed')
				)
			);

		const [row] = await tx
			.insert(vendorAgreements)
			.values({
				vendorId: input.vendorId,
				templateId: input.templateId,
				status: 'signed',
				signedByName: input.signedByName,
				signatureDataUrl: input.signatureDataUrl,
				paperOriginalOnFile: input.paperOriginalOnFile,
				bodySnapshot: template.bodyMarkdown,
				templateVersion: template.version,
				termsSnapshot: {
					monthlyRentCents: vendor.monthlyRentCents,
					maxDiscountPercent: vendor.maxDiscountPercent,
					boothNumber: vendor.boothNumber,
					extraFieldValues: input.extraFieldValues
				},
				witnessedByUserId: input.witnessedByUserId ?? null
			})
			.returning();

		log.info(
			{
				vendorId: input.vendorId,
				templateId: input.templateId,
				agreementId: row.id,
				paperOriginalOnFile: input.paperOriginalOnFile
			},
			'Signed agreement'
		);

		return row;
	});
}

// Identity fields where NRS is the source of truth. If NRS has a non-null
// value, it always wins — admin should edit these in NRS, not TT.
// (Empty NRS values do not wipe TT — protects against accidental clears in NRS.)
const NRS_AUTHORITATIVE_KEYS = [
	'contactName',
	'contactEmail',
	'contactPhone',
	'addressLine1',
	'addressLine2',
	'city',
	'state',
	'zip'
] as const;

// (Inventory prefix is the only TT-managed field worth backfilling from NRS —
// rent/commission % come via the notes parser elsewhere. Special-cased inline
// in nrsDetailToPatch.)

const PREFIX_RE_INNER = /^[A-Z0-9]{2,8}$/;

/**
 * Best-effort parse of the NRS `notes` field for booth rent + commission %.
 *
 * NRS doesn't expose Booth Rent and Vendor Payment % structured via the API,
 * but staff often record them in `notes` like:
 *   "13% commissions ... 100. rent ... *04/01/25 Rent Increased to 175"
 *
 * Strategy: scan the entire notes string, capture every dollar/% match
 * mentioned alongside "rent" or "commission", and use the LAST occurrence
 * of each (since notes are typically appended chronologically).
 */
export function parseRentAndPaymentFromNotes(notes: string | null): {
	suggestedMonthlyRentCents: number | null;
	suggestedCommissionPercent: number | null;
	suggestedVendorPaymentPercent: number | null;
} {
	if (!notes) return { suggestedMonthlyRentCents: null, suggestedCommissionPercent: null, suggestedVendorPaymentPercent: null };

	// Rent: capture variations like "Rent Increased to 175", "$100 rent", "100. rent",
	// "rent $175", "Booth Rent: 175", "Rent due for May is $244".
	const rentMatches: number[] = [];
	const rentPatterns: RegExp[] = [
		/rent(?:\s+(?:increased|raised|changed))?\s+(?:to|is|=)\s+\$?\s*(\d+(?:\.\d+)?)/gi,
		/rent\s+(?:due|amount)?\s*(?:for\s+\w+\s+)?(?:is|=)\s*\$?\s*(\d+(?:\.\d+)?)/gi,
		/(?:^|[\s,$])\$?\s*(\d+(?:\.\d+)?)\s*(?:[\.\s]\s*)?\.?\s*(?:monthly\s+)?rent\b/gi,
		/booth\s+rent\s*[:=]?\s*\$?\s*(\d+(?:\.\d+)?)/gi,
		/(?:monthly\s+)?rent\s*[:=]\s*\$?\s*(\d+(?:\.\d+)?)/gi,
		/rent\s+\$\s*(\d+(?:\.\d+)?)/gi
	];
	for (const re of rentPatterns) {
		for (const m of notes.matchAll(re)) {
			const v = parseFloat(m[1]);
			if (isFinite(v) && v >= 5 && v <= 5000) rentMatches.push(v);
		}
	}
	const lastRent = rentMatches.length ? rentMatches[rentMatches.length - 1] : null;

	// Commission %: e.g. "13% commission", "13 % commissions"
	const commMatches: number[] = [];
	for (const m of notes.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(?:commission|commish)/gi)) {
		const v = parseFloat(m[1]);
		if (isFinite(v) && v >= 0 && v <= 100) commMatches.push(v);
	}
	const lastComm = commMatches.length ? commMatches[commMatches.length - 1] : null;

	return {
		suggestedMonthlyRentCents: lastRent !== null ? Math.round(lastRent * 100) : null,
		suggestedCommissionPercent: lastComm,
		suggestedVendorPaymentPercent: lastComm !== null ? Number((100 - lastComm).toFixed(2)) : null
	};
}

/**
 * Build the patch we'd apply to a vendor from a fresh NRS detail record.
 * Only includes fields that aren't already filled in on the TT side, plus
 * an always-replaced `notes` merge (we append rather than overwrite).
 */
function nrsDetailToPatch(
	detail: NrsVendorDetail,
	current: Vendor
): Partial<typeof vendors.$inferInsert> {
	const patch: Record<string, unknown> = {};

	// Identity fields — NRS wins when it has a value. Lets admin keep contact
	// info accurate by editing only in NRS; TT picks up changes on next sync.
	const identityFields: { key: typeof NRS_AUTHORITATIVE_KEYS[number]; value: string | null }[] = [
		{ key: 'contactName', value: detail.contact || null },
		{ key: 'contactEmail', value: detail.email ? detail.email.trim().toLowerCase() : null },
		{ key: 'contactPhone', value: detail.phone || null },
		{ key: 'addressLine1', value: detail.address || null },
		{ key: 'addressLine2', value: detail.address2 || null },
		{ key: 'city', value: detail.city || null },
		{ key: 'state', value: detail.state || null },
		{ key: 'zip', value: detail.zipCode || null }
	];

	for (const { key, value } of identityFields) {
		// Only overwrite if NRS has a value AND it differs from what we have.
		// Empty NRS doesn't wipe TT (guards against accidental clears upstream).
		if (value && value !== current[key]) patch[key] = value;
	}

	// Inventory prefix: NRS `vendorCode` is the SKU prefix. Validate before applying.
	// Backfill-only — admin may have set a different prefix locally for legacy
	// reasons (e.g. tags already printed under an old code).
	if (!current.inventoryCodePrefix && detail.vendorCode) {
		const candidate = detail.vendorCode.trim().toUpperCase();
		if (PREFIX_RE_INNER.test(candidate)) {
			patch.inventoryCodePrefix = candidate;
		}
	}

	// Best-effort parse of rent + payment % from NRS notes — only fill blanks.
	const parsed = parseRentAndPaymentFromNotes(detail.notes);
	if (current.monthlyRentCents === null && parsed.suggestedMonthlyRentCents !== null) {
		patch.monthlyRentCents = parsed.suggestedMonthlyRentCents;
	}
	if (current.vendorPaymentPercent === null && parsed.suggestedVendorPaymentPercent !== null) {
		patch.vendorPaymentPercent = String(parsed.suggestedVendorPaymentPercent);
	}

	// Mirror NRS notes into TT (overwrite — NRS is source of truth for this field)
	// so admin can read what NRS knows directly from the vendor detail page.
	const nrsNotes = detail.notes?.trim() || null;
	if (nrsNotes !== current.notes) {
		patch.notes = nrsNotes;
	}

	return patch;
}

export interface SyncFromNrsResult {
	created: number;
	enriched: number;
	skipped: number;
	filteredOut: number;
	prefixCollisions: number;
}

/**
 * Set of NRS vendor IDs that are pass-through vendors — i.e. vendors who
 * have appeared in our sales history. Used to filter the NRS vendor list
 * down to consignment vendors we actually want to track.
 */
async function getPassThroughVendorIds(): Promise<Set<number>> {
	const rows = await db
		.selectDistinct({ vendorId: salesTransactions.vendorId })
		.from(salesTransactions)
		.where(sql`${salesTransactions.vendorId} IS NOT NULL AND ${salesTransactions.vendorId} > 0`);
	return new Set(rows.map((r) => r.vendorId));
}

/**
 * Pull the NRS vendor list and reconcile with TT.
 *
 * For each NRS vendor:
 *  - If we don't have it yet → create a row, populated from `vendor/get` detail
 *    (vendorCode → inventoryCodePrefix, contact, address, email, phone).
 *  - If we already have it → enrich by backfilling any fields we have null for,
 *    and apply the prefix if we don't have one (and the NRS code is valid).
 *  - Never overwrite admin-edited values.
 *
 * Idempotent. Prefix uniqueness conflicts (two NRS vendors sharing `vendorCode`)
 * are logged and skipped — admin can resolve manually.
 */
export async function syncFromNrs(): Promise<SyncFromNrsResult> {
	const [nrsVendors, passThroughIds] = await Promise.all([
		fetchNrsVendors(),
		getPassThroughVendorIds()
	]);
	const existing = await db
		.select()
		.from(vendors)
		.where(sql`${vendors.nrsVendorId} IS NOT NULL`);
	const byNrsId = new Map(existing.map((v) => [v.nrsVendorId!, v]));

	const usedPrefixes = new Set(
		existing.map((v) => v.inventoryCodePrefix).filter((p): p is string => !!p)
	);

	let created = 0;
	let enriched = 0;
	let filteredOut = 0;
	let prefixCollisions = 0;

	for (const summary of nrsVendors) {
		// Skip system rows like "*** Not-on-File Vendor ***"
		if (summary.name?.startsWith('***')) continue;

		const detail = await getVendorDetail(summary.vendorId);
		if (!detail) continue; // err 201 — skip

		// Filter: only sync pass-through vendors — i.e. vendors that have
		// appeared in our sales history (they're consignment vendors whose
		// items run through the POS). Non-pass-through NRS rows (accounting
		// adjustments, system entries) are excluded.
		const isPassThrough = passThroughIds.has(detail.vendorId);
		if (!isPassThrough) {
			filteredOut++;
			continue;
		}

		const current = byNrsId.get(summary.vendorId);

		if (!current) {
			// Build a fresh insert, applying detail fields.
			const candidatePrefix = detail.vendorCode?.trim().toUpperCase();
			let inventoryCodePrefix: string | null = null;
			if (candidatePrefix && PREFIX_RE_INNER.test(candidatePrefix)) {
				if (usedPrefixes.has(candidatePrefix)) {
					prefixCollisions++;
					log.warn(
						{ nrsVendorId: detail.vendorId, prefix: candidatePrefix },
						'NRS sync: prefix collision — leaving prefix null'
					);
				} else {
					inventoryCodePrefix = candidatePrefix;
					usedPrefixes.add(candidatePrefix);
				}
			}

			const parsedNew = parseRentAndPaymentFromNotes(detail.notes);
			await db.insert(vendors).values({
				nrsVendorId: detail.vendorId,
				displayName: summary.name || `NRS Vendor ${detail.vendorId}`,
				contactName: detail.contact || null,
				contactEmail: detail.email ? detail.email.trim().toLowerCase() : null,
				contactPhone: detail.phone || null,
				addressLine1: detail.address || null,
				addressLine2: detail.address2 || null,
				city: detail.city || null,
				state: detail.state || null,
				zip: detail.zipCode || null,
				inventoryCodePrefix,
				monthlyRentCents: parsedNew.suggestedMonthlyRentCents,
				vendorPaymentPercent:
					parsedNew.suggestedVendorPaymentPercent !== null
						? String(parsedNew.suggestedVendorPaymentPercent)
						: null,
				notes: detail.notes?.trim() || null,
				status: 'inactive'
			});
			created++;
			continue;
		}

		// Existing row — backfill empty fields only.
		const patch = nrsDetailToPatch(detail, current);
		if (patch.inventoryCodePrefix && usedPrefixes.has(patch.inventoryCodePrefix as string)) {
			prefixCollisions++;
			log.warn(
				{ vendorId: current.id, prefix: patch.inventoryCodePrefix },
				'NRS sync: prefix collision on existing vendor — leaving prefix null'
			);
			delete patch.inventoryCodePrefix;
		}

		if (Object.keys(patch).length > 0) {
			if (patch.inventoryCodePrefix) usedPrefixes.add(patch.inventoryCodePrefix as string);
			await db
				.update(vendors)
				.set({ ...patch, updatedAt: new Date() })
				.where(eq(vendors.id, current.id));
			enriched++;
		}
	}

	const skipped = nrsVendors.length - created - enriched - filteredOut;
	log.info({ created, enriched, skipped, filteredOut, prefixCollisions }, 'NRS sync complete');
	return { created, enriched, skipped, filteredOut, prefixCollisions };
}

// ── CSV import (NRS vendor grid export) ─────────────────────────────────────

export interface VendorCsvImportResult {
	parsed: number;
	unique: number;
	updated: number;
	noChange: number;
	missed: number;
	missedCodes: string[];
	inactiveDeleted: number;
	inactiveKept: number;
}

/**
 * Tiny quote-aware CSV parser. Handles `"a, b"` cells. Doesn't support
 * escaped quotes (`""`) since the NRS export doesn't use them.
 */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') inQuotes = false;
			else cell += c;
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			cell = '';
			if (row.some((x) => x.length > 0)) rows.push(row);
			row = [];
		} else {
			cell += c;
		}
	}
	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		if (row.some((x) => x.length > 0)) rows.push(row);
	}
	return rows;
}

/**
 * Import a NRS vendors CSV export (the format you get from the NRS web UI's
 * vendor grid). Matches by `inventoryCodePrefix` and fills empty TT fields:
 *   - monthly_rent_cents (from "Booth Rent")
 *   - vendor_payment_percent (from "Pass-Through Vendor Payment %")
 *   - contact_name / contact_email / contact_phone (only when blank)
 *
 * Never overwrites a value the admin has set.
 */
export async function importVendorsFromCsv(csvText: string): Promise<VendorCsvImportResult> {
	const all = parseCsv(csvText);
	if (all.length === 0) throw new VendorServiceError('CSV is empty');
	const header = all[0].map((h) => h.trim());
	const dataRows = all.slice(1);
	const idx = (name: string) => header.indexOf(name);
	const codeCol = idx('Vendor ID');
	const payCol = idx('Pass-Through Vendor Payment %');
	const rentCol = idx('Booth Rent');
	const contactCol = idx('Contact');
	const phoneCol = idx('Phone');
	const emailCol = idx('Email');
	const inactiveCol = idx('Inactive');

	if (codeCol < 0) {
		throw new VendorServiceError('CSV is missing the "Vendor ID" column. Expected NRS vendor grid export format.');
	}

	// Dedupe by vendor code (NRS sometimes exports duplicates)
	const byCode = new Map<string, string[]>();
	for (const r of dataRows) {
		const code = (r[codeCol] ?? '').trim().toUpperCase();
		if (!code) continue;
		byCode.set(code, r);
	}

	let updated = 0;
	let noChange = 0;
	let missed = 0;
	const missedCodes: string[] = [];

	for (const [code, row] of byCode.entries()) {
		const paymentPctRaw = (row[payCol] ?? '').replace('%', '').trim();
		const boothRentRaw = (row[rentCol] ?? '').trim();
		const contactRaw = ((contactCol >= 0 ? row[contactCol] : '') ?? '').trim();
		const phoneRaw = ((phoneCol >= 0 ? row[phoneCol] : '') ?? '').trim();
		const emailRaw = ((emailCol >= 0 ? row[emailCol] : '') ?? '').trim();
		const inactiveRaw = ((inactiveCol >= 0 ? row[inactiveCol] : '') ?? '').trim().toLowerCase();
		const inactive = ['yes', 'y', 'true', '1', 'inactive'].includes(inactiveRaw);

		const paymentPct = paymentPctRaw && paymentPctRaw !== '---' ? paymentPctRaw : null;
		const rentDollars = boothRentRaw && boothRentRaw !== '---' ? parseFloat(boothRentRaw) : null;
		const rentCents = rentDollars !== null && isFinite(rentDollars) ? Math.round(rentDollars * 100) : null;
		const contact = contactRaw && contactRaw !== '---' ? contactRaw : null;
		const phone = phoneRaw && phoneRaw !== '---' ? phoneRaw : null;
		const email =
			emailRaw && !emailRaw.startsWith('---') && emailRaw !== '---'
				? emailRaw.toLowerCase()
				: null;

		const [match] = await db
			.select()
			.from(vendors)
			.where(sql`upper(${vendors.inventoryCodePrefix}) = ${code}`)
			.limit(1);
		if (!match) {
			missed++;
			missedCodes.push(code);
			continue;
		}

		const patch: Record<string, unknown> = {};
		if (rentCents !== null && match.monthlyRentCents === null) patch.monthlyRentCents = rentCents;
		if (paymentPct !== null && match.vendorPaymentPercent === null) patch.vendorPaymentPercent = paymentPct;
		if (contact && !match.contactName) patch.contactName = contact;
		if (email && !match.contactEmail) patch.contactEmail = email;
		if (phone && !match.contactPhone) patch.contactPhone = phone;
		// Inactive flag is authoritative — always overwrite from CSV when column present.
		if (inactiveCol >= 0 && match.nrsInactive !== inactive) patch.nrsInactive = inactive;

		if (Object.keys(patch).length === 0) {
			noChange++;
			continue;
		}

		await db.update(vendors).set({ ...patch, updatedAt: new Date() }).where(eq(vendors.id, match.id));
		updated++;
	}

	// Delete vendors flagged nrs_inactive that have no TT-side data attached.
	// Safety: never delete one with portal access, a linked user, or any signed
	// agreement. Anything kept is left visible only when the toggle is on.
	let inactiveDeleted = 0;
	let inactiveKept = 0;
	if (inactiveCol >= 0) {
		const inactiveCandidates = await db
			.select({
				id: vendors.id,
				userId: vendors.userId,
				portalEnabled: vendors.portalEnabled
			})
			.from(vendors)
			.where(eq(vendors.nrsInactive, true));

		const candidateIds = inactiveCandidates
			.filter((v) => !v.userId && !v.portalEnabled)
			.map((v) => v.id);

		if (candidateIds.length > 0) {
			const withAgreements = await db
				.selectDistinct({ vendorId: vendorAgreements.vendorId })
				.from(vendorAgreements)
				.where(inArray(vendorAgreements.vendorId, candidateIds));
			const blocked = new Set(withAgreements.map((r) => r.vendorId));

			const safeToDelete = candidateIds.filter((id) => !blocked.has(id));
			if (safeToDelete.length > 0) {
				await db.delete(vendors).where(inArray(vendors.id, safeToDelete));
			}
			inactiveDeleted = safeToDelete.length;
			inactiveKept = inactiveCandidates.length - safeToDelete.length;
		} else {
			inactiveKept = inactiveCandidates.length;
		}
	}

	log.info(
		{
			parsed: dataRows.length,
			unique: byCode.size,
			updated,
			noChange,
			missed,
			inactiveDeleted,
			inactiveKept
		},
		'CSV import complete'
	);
	return {
		parsed: dataRows.length,
		unique: byCode.size,
		updated,
		noChange,
		missed,
		missedCodes,
		inactiveDeleted,
		inactiveKept
	};
}

/**
 * Remove "stub" vendor rows that are inactive AND empty AND don't match the
 * sync filter (no vendorCode, no sales). Safe-by-default: never deletes a
 * vendor that has portal access, a linked user, an inventory prefix set, any
 * signed agreement, or any sales history.
 *
 * Returns counts so admin can see what got cleaned up.
 */
export async function removeUnusedVendorStubs(): Promise<{ removed: number; kept: number }> {
	const [allInactive, passThroughIds] = await Promise.all([
		db.select().from(vendors).where(eq(vendors.status, 'inactive')),
		getPassThroughVendorIds()
	]);

	// Pre-filter on cheap fields first
	const candidates = allInactive.filter((v) => {
		if (v.userId !== null) return false;
		if (v.portalEnabled) return false;
		if (v.inventoryCodePrefix) return false;
		if (v.nrsVendorId !== null && passThroughIds.has(v.nrsVendorId)) return false;
		return true;
	});

	if (candidates.length === 0) {
		return { removed: 0, kept: allInactive.length };
	}

	// Exclude any candidate that has a signed or voided agreement (any agreement at all)
	const candidateIds = candidates.map((c) => c.id);
	const withAgreementsRows = await db
		.selectDistinct({ vendorId: vendorAgreements.vendorId })
		.from(vendorAgreements)
		.where(inArray(vendorAgreements.vendorId, candidateIds));
	const withAgreements = new Set(withAgreementsRows.map((r) => r.vendorId));

	const safeToDelete = candidateIds.filter((id) => !withAgreements.has(id));
	if (safeToDelete.length === 0) {
		return { removed: 0, kept: allInactive.length };
	}

	await db.delete(vendors).where(inArray(vendors.id, safeToDelete));
	log.info({ removed: safeToDelete.length, kept: allInactive.length - safeToDelete.length }, 'Removed unused vendor stubs');
	return { removed: safeToDelete.length, kept: allInactive.length - safeToDelete.length };
}

// ── Onboarding (Stage 2a) ────────────────────────────────────────────────────

const PREFIX_RE = /^[A-Z0-9]{2,8}$/;

export class VendorServiceError extends Error {}

/**
 * Validate and persist a vendor's inventory code prefix.
 * Uppercases input. Throws on invalid format or uniqueness collision.
 */
export async function setInventoryPrefix(vendorId: string, prefixRaw: string | null): Promise<Vendor> {
	const prefix = prefixRaw?.trim().toUpperCase() || null;
	if (prefix !== null && !PREFIX_RE.test(prefix)) {
		throw new VendorServiceError('Inventory code prefix must be 2-8 letters or digits (A-Z, 0-9)');
	}

	if (prefix) {
		const [conflict] = await db
			.select({ id: vendors.id })
			.from(vendors)
			.where(and(eq(vendors.inventoryCodePrefix, prefix), sql`${vendors.id} <> ${vendorId}`))
			.limit(1);
		if (conflict) {
			throw new VendorServiceError(`Prefix "${prefix}" is already used by another vendor`);
		}
	}

	const [updated] = await db
		.update(vendors)
		.set({ inventoryCodePrefix: prefix, updatedAt: new Date() })
		.where(eq(vendors.id, vendorId))
		.returning();
	if (!updated) throw new VendorServiceError(`Vendor not found: ${vendorId}`);
	return updated;
}

/**
 * Replace the vendor's group memberships in a single transaction.
 */
export async function setVendorGroups(vendorId: string, groupIds: string[]): Promise<void> {
	const unique = Array.from(new Set(groupIds));
	await db.transaction(async (tx) => {
		await tx.delete(vendorGroupMembers).where(eq(vendorGroupMembers.vendorId, vendorId));
		if (unique.length > 0) {
			await tx.insert(vendorGroupMembers).values(
				unique.map((groupId) => ({ vendorId, groupId }))
			);
		}
	});
	log.info({ vendorId, groupCount: unique.length }, 'Updated vendor groups');
}

export async function getVendorGroups(vendorId: string): Promise<VendorGroup[]> {
	const rows = await db
		.select({ group: vendorGroups })
		.from(vendorGroupMembers)
		.innerJoin(vendorGroups, eq(vendorGroups.id, vendorGroupMembers.groupId))
		.where(eq(vendorGroupMembers.vendorId, vendorId))
		.orderBy(vendorGroups.displayOrder, vendorGroups.name);
	return rows.map((r) => r.group);
}

export async function markOnboardingComplete(vendorId: string, complete = true): Promise<void> {
	await db
		.update(vendors)
		.set({ onboardingComplete: complete, updatedAt: new Date() })
		.where(eq(vendors.id, vendorId));
}

async function getVendorUserTypeId(): Promise<string> {
	const [row] = await db
		.select({ id: userTypes.id })
		.from(userTypes)
		.where(eq(userTypes.name, 'Vendor'))
		.limit(1);
	if (!row) {
		throw new VendorServiceError(
			'Vendor user type not found — run the seed script to create it before enabling portal access'
		);
	}
	return row.id;
}

function uniqueUsernameFromEmail(email: string): string {
	const slug = email.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 32);
	const suffix = randomUUID().slice(0, 6);
	return `${slug || 'vendor'}-${suffix}`;
}

/**
 * Enable portal access for a vendor. Creates (or links to) a `users` row,
 * sets a password, marks `vendors.portalEnabled=true`.
 *
 * If a user with `email` already exists, it links to that user and updates the
 * password — useful when a paper-archive vendor was previously created as a
 * staff user under the same email. Otherwise creates a fresh user with an
 * unused PIN (vendors don't sign in with PIN) and the supplied password.
 */
export async function enablePortal(input: {
	vendorId: string;
	email: string;
	contactName: string;
	password: string;
}): Promise<{ vendor: Vendor; userId: string; createdUser: boolean }> {
	const email = input.email.trim().toLowerCase();
	if (!email) throw new VendorServiceError('Email is required');
	if (input.password.length < 8) throw new VendorServiceError('Password must be at least 8 characters');
	if (!input.contactName.trim()) throw new VendorServiceError('Contact name is required');

	const vendorTypeId = await getVendorUserTypeId();
	const passwordHash = await hashPin(input.password);

	return db.transaction(async (tx) => {
		const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
		if (!vendor) throw new VendorServiceError(`Vendor not found: ${input.vendorId}`);

		const [existingUser] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

		let userId: string;
		let createdUser = false;
		if (existingUser) {
			userId = existingUser.id;
			await tx
				.update(users)
				.set({
					passwordHash,
					userTypeId: vendorTypeId,
					name: input.contactName,
					isActive: true,
					updatedAt: new Date()
				})
				.where(eq(users.id, userId));
		} else {
			// Vendors don't use PIN — set a random Argon2 hash they can't sign in with.
			const dummyPinHash = await hashPin(randomUUID());
			// Username defaults to email (login is by email anyway, so this keeps
			// the two consistent for vendor messaging). Falls back to a slug if
			// some other user already has this email as their username.
			const [usernameCollision] = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.username, email))
				.limit(1);
			const username = usernameCollision ? uniqueUsernameFromEmail(email) : email;
			const [created] = await tx
				.insert(users)
				.values({
					email,
					username,
					name: input.contactName,
					pinHash: dummyPinHash,
					passwordHash,
					role: 'staff',
					userTypeId: vendorTypeId,
					twoFactorEnabled: false,
					includeInLaborCost: false,
					isActive: true
				})
				.returning({ id: users.id });
			userId = created.id;
			createdUser = true;
		}

		const [updatedVendor] = await tx
			.update(vendors)
			.set({ userId, portalEnabled: true, updatedAt: new Date() })
			.where(eq(vendors.id, input.vendorId))
			.returning();

		log.info(
			{ vendorId: input.vendorId, userId, createdUser },
			'Enabled portal access for vendor'
		);
		return { vendor: updatedVendor, userId, createdUser };
	});
}

/**
 * Reset the portal password for an already-linked vendor user.
 */
export async function resetPortalPassword(vendorId: string, password: string): Promise<void> {
	if (password.length < 8) throw new VendorServiceError('Password must be at least 8 characters');
	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
	if (!vendor) throw new VendorServiceError(`Vendor not found: ${vendorId}`);
	if (!vendor.userId) throw new VendorServiceError('Vendor has no linked user account');

	const passwordHash = await hashPin(password);
	await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, vendor.userId));
	log.info({ vendorId, userId: vendor.userId }, 'Reset vendor portal password');
}

/**
 * Generate a memorable 12-char temp password from an unambiguous alphabet
 * (no 0/O/1/l/I). ~71 bits of entropy. Used for emailed/texted credentials —
 * always paired with `mustChangePassword=true` so the vendor sets their own
 * password on first login.
 */
export function generateTempPassword(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
	const bytes = randomBytes(12);
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += alphabet[bytes[i] % alphabet.length];
	}
	return out;
}

export interface InviteVendorChannels {
	email: boolean;
	sms: boolean;
}

export interface InviteVendorResult {
	vendor: Vendor;
	tempPassword: string; // returned to admin once for copy/paste fallback
	channelsAttempted: string[];
	channelsSucceeded: string[];
	channelsFailed: { channel: string; error: string }[];
}

const PORTAL_LOGIN_URL =
	process.env.PUBLIC_BASE_URL ?? 'https://backoffice.yakimafinds.com';

/**
 * Send (or re-send) portal credentials to a vendor. Generates a temp password,
 * enables portal access if not already, flags `users.mustChangePassword=true`
 * so the vendor sets their own password on first login, and delivers the
 * credentials over the requested channels.
 *
 * Idempotent for resends: each call generates a fresh password and re-flags
 * mustChangePassword. The vendor's previous password becomes invalid.
 */
export async function inviteVendorToPortal(input: {
	vendorId: string;
	channels: InviteVendorChannels;
	sentByUserId: string;
}): Promise<InviteVendorResult> {
	if (!input.channels.email && !input.channels.sms) {
		throw new VendorServiceError('Pick at least one channel: email or sms');
	}

	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
	if (!vendor) throw new VendorServiceError(`Vendor not found: ${input.vendorId}`);

	if (input.channels.email && !vendor.contactEmail) {
		throw new VendorServiceError('Vendor has no contact email — add one before sending');
	}
	if (input.channels.sms && !vendor.contactPhone) {
		throw new VendorServiceError('Vendor has no contact phone — add one before sending');
	}

	const contactName = (vendor.contactName ?? vendor.displayName).trim() || vendor.displayName;
	const email = (vendor.contactEmail ?? '').trim().toLowerCase();
	if (!email) {
		// Even SMS-only invites need an email on the user row (login is by email).
		throw new VendorServiceError('Vendor needs an email on file to receive a login account');
	}

	const tempPassword = generateTempPassword();

	// enablePortal handles user create-or-link, password hash, vendor flag flip.
	const result = await enablePortal({
		vendorId: input.vendorId,
		email,
		contactName,
		password: tempPassword
	});

	// Flag the user for forced password change. enablePortal just set passwordHash,
	// so this guarantees the vendor changes it on first login regardless of whether
	// the user row already existed.
	await db
		.update(users)
		.set({ mustChangePassword: true, updatedAt: new Date() })
		.where(eq(users.id, result.userId));

	// Deliver across requested channels in parallel. SMS failure shouldn't block email.
	const attempts: { channel: 'email' | 'sms'; promise: Promise<{ success: boolean; error?: string }> }[] = [];
	if (input.channels.email) {
		attempts.push({
			channel: 'email',
			promise: sendVendorPortalInvitationEmail({
				to: email,
				contactName,
				loginUrl: PORTAL_LOGIN_URL + '/login',
				tempPassword
			}).then(
				(ok) => ({ success: ok, error: ok ? undefined : 'SMTP send returned false' }),
				(err) => ({ success: false, error: err instanceof Error ? err.message : String(err) })
			)
		});
	}
	if (input.channels.sms) {
		const phone = formatPhoneToE164(vendor.contactPhone ?? '');
		if (!phone) {
			attempts.push({
				channel: 'sms',
				promise: Promise.resolve({ success: false, error: 'Could not parse phone number' })
			});
		} else {
			const body =
				`Your vendor portal is ready.\n` +
				`Sign in: ${PORTAL_LOGIN_URL}/login\n` +
				`Email: ${email}\n` +
				`Password: ${tempPassword}\n` +
				`You'll set a new password on first login.`;
			attempts.push({
				channel: 'sms',
				promise: sendSMS(phone, body).then((r) => ({
					success: r.success,
					error: r.success ? undefined : r.error ?? 'unknown SMS error'
				}))
			});
		}
	}

	const settled = await Promise.all(attempts.map(async (a) => ({ channel: a.channel, ...(await a.promise) })));
	const channelsAttempted = settled.map((s) => s.channel);
	const channelsSucceeded = settled.filter((s) => s.success).map((s) => s.channel);
	const channelsFailed = settled
		.filter((s) => !s.success)
		.map((s) => ({ channel: s.channel, error: s.error ?? 'unknown' }));

	const sentVia =
		channelsSucceeded.length === 0
			? null
			: channelsSucceeded.length === 2
				? 'email+sms'
				: channelsSucceeded[0];

	let updatedVendor = result.vendor;
	if (sentVia) {
		const [stamped] = await db
			.update(vendors)
			.set({
				credentialsSentAt: new Date(),
				credentialsSentVia: sentVia,
				credentialsSentByUserId: input.sentByUserId,
				updatedAt: new Date()
			})
			.where(eq(vendors.id, input.vendorId))
			.returning();
		updatedVendor = stamped;
	}

	log.info(
		{
			vendorId: input.vendorId,
			userId: result.userId,
			channelsAttempted,
			channelsSucceeded,
			channelsFailed
		},
		'Sent vendor portal invitation'
	);

	return {
		vendor: updatedVendor,
		tempPassword,
		channelsAttempted,
		channelsSucceeded,
		channelsFailed
	};
}

/**
 * Disable portal access. Flips `portalEnabled=false` and deactivates the
 * linked user so they can't log in. The user row remains for audit.
 */
export async function disablePortal(vendorId: string): Promise<void> {
	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
	if (!vendor) throw new VendorServiceError(`Vendor not found: ${vendorId}`);

	await db.transaction(async (tx) => {
		await tx
			.update(vendors)
			.set({ portalEnabled: false, updatedAt: new Date() })
			.where(eq(vendors.id, vendorId));
		if (vendor.userId) {
			await tx
				.update(users)
				.set({ isActive: false, updatedAt: new Date() })
				.where(eq(users.id, vendor.userId));
		}
	});
	log.info({ vendorId }, 'Disabled portal access for vendor');
}

/**
 * Generate the next sequential part number for a vendor.
 * Format: {vendor.inventoryCodePrefix}{YY}{M}{D}{NNNN}
 *   YY  = 2-digit year
 *   M   = month, no leading zero (1..12)
 *   D   = day, no leading zero (1..31)
 *   NNNN = zero-padded serial within the (vendor, day) bucket
 *
 * Example: today (May 8, 2026) → SR2658{NNNN}
 *
 * The compact date format is intentionally lossy — `26111` is ambiguous
 * between Jan 11 and Nov 1 — but uniqueness is preserved by the always-
 * incrementing serial counter keyed on (vendor, dateStr).
 */
export async function generatePartNumber(vendorId: string, opts?: { now?: Date }): Promise<string> {
	const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
	if (!vendor) throw new VendorServiceError('Vendor not found');
	if (!vendor.inventoryCodePrefix) {
		throw new VendorServiceError(
			'Vendor has no inventory code prefix — set one before generating part numbers'
		);
	}

	const now = opts?.now ?? new Date();
	const yy = String(now.getUTCFullYear()).slice(-2);
	const m = String(now.getUTCMonth() + 1);
	const d = String(now.getUTCDate());
	const dateStr = `${yy}${m}${d}`;

	// Atomic increment: insert with last_number=1 if no row, otherwise bump.
	const [row] = await db
		.insert(vendorPartnumberSequences)
		.values({ vendorId, dateStr, lastNumber: 1 })
		.onConflictDoUpdate({
			target: [vendorPartnumberSequences.vendorId, vendorPartnumberSequences.dateStr],
			set: {
				lastNumber: sql`${vendorPartnumberSequences.lastNumber} + 1`,
				updatedAt: new Date()
			}
		})
		.returning({ lastNumber: vendorPartnumberSequences.lastNumber });

	const serial = String(row.lastNumber).padStart(4, '0');
	return `${vendor.inventoryCodePrefix}${dateStr}${serial}`;
}

/**
 * Resolve the vendor record for a logged-in user, if they're a portal user.
 * Returns null when the user isn't a vendor portal user.
 */
export async function getVendorForUser(userId: string): Promise<Vendor | null> {
	const [row] = await db
		.select()
		.from(vendors)
		.where(and(eq(vendors.userId, userId), eq(vendors.portalEnabled, true)))
		.limit(1);
	return row ?? null;
}

