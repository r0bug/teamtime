/**
 * Vendor service — CRUD, NRS sync, and agreement signing.
 *
 * NRS is the source of truth for vendor identity, sales, commissions, and
 * inventory. TeamTime stores TT-specific fields (contract terms, contact info,
 * signed agreements, notes) keyed off `nrsVendorId`.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db';
import {
	vendors,
	vendorAgreements,
	agreementTemplates,
	users,
	userTypes,
	vendorGroupMembers,
	vendorGroups,
	type Vendor,
	type NewVendor,
	type VendorAgreement,
	type AgreementTemplate,
	type VendorGroup
} from '$lib/server/db/schema';
import { getVendors as fetchNrsVendors, getVendorDetail, type NrsVendorDetail } from './nrs-api-client';
import { hashPin } from '$lib/server/auth/pin';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor');

export interface VendorListItem extends Vendor {
	primaryAgreement: { id: string; signedAt: Date; templateTitle: string } | null;
	activeAddonCount: number;
}

export async function listVendors(filters?: {
	status?: 'active' | 'inactive' | 'terminated';
	search?: string;
}): Promise<VendorListItem[]> {
	const conditions = [];
	if (filters?.status) conditions.push(eq(vendors.status, filters.status));

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
				sql`${vendorAgreements.vendorId} = ANY(${ids})`
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

// Empty-only fields: backfill from NRS without overwriting admin-edited data.
const EMPTY_BACKFILL_KEYS = [
	'contactName',
	'contactEmail',
	'contactPhone',
	'addressLine1',
	'addressLine2',
	'city',
	'state',
	'zip',
	'inventoryCodePrefix'
] as const;

const PREFIX_RE_INNER = /^[A-Z0-9]{2,6}$/;

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

	const fields: { key: typeof EMPTY_BACKFILL_KEYS[number]; value: string | null }[] = [
		{ key: 'contactName', value: detail.contact || null },
		{ key: 'contactEmail', value: detail.email ? detail.email.trim().toLowerCase() : null },
		{ key: 'contactPhone', value: detail.phone || null },
		{ key: 'addressLine1', value: detail.address || null },
		{ key: 'addressLine2', value: detail.address2 || null },
		{ key: 'city', value: detail.city || null },
		{ key: 'state', value: detail.state || null },
		{ key: 'zip', value: detail.zipCode || null }
	];

	for (const { key, value } of fields) {
		if (current[key] === null && value) patch[key] = value;
	}

	// Inventory prefix: NRS `vendorCode` is the SKU prefix. Validate before applying.
	if (!current.inventoryCodePrefix && detail.vendorCode) {
		const candidate = detail.vendorCode.trim().toUpperCase();
		if (PREFIX_RE_INNER.test(candidate)) {
			patch.inventoryCodePrefix = candidate;
		}
	}

	return patch;
}

export interface SyncFromNrsResult {
	created: number;
	enriched: number;
	skipped: number;
	prefixCollisions: number;
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
	const nrsVendors = await fetchNrsVendors();
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
	let prefixCollisions = 0;

	for (const summary of nrsVendors) {
		// Skip system rows like "*** Not-on-File Vendor ***"
		if (summary.name?.startsWith('***')) continue;

		const detail = await getVendorDetail(summary.vendorId);
		if (!detail) continue; // err 201 — skip

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

	const skipped = nrsVendors.length - created - enriched;
	log.info({ created, enriched, skipped, prefixCollisions }, 'NRS sync complete');
	return { created, enriched, skipped, prefixCollisions };
}

// ── Onboarding (Stage 2a) ────────────────────────────────────────────────────

const PREFIX_RE = /^[A-Z0-9]{2,6}$/;

export class VendorServiceError extends Error {}

/**
 * Validate and persist a vendor's inventory code prefix.
 * Uppercases input. Throws on invalid format or uniqueness collision.
 */
export async function setInventoryPrefix(vendorId: string, prefixRaw: string | null): Promise<Vendor> {
	const prefix = prefixRaw?.trim().toUpperCase() || null;
	if (prefix !== null && !PREFIX_RE.test(prefix)) {
		throw new VendorServiceError('Inventory code prefix must be 2-6 letters or digits (A-Z, 0-9)');
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
			const [created] = await tx
				.insert(users)
				.values({
					email,
					username: uniqueUsernameFromEmail(email),
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

