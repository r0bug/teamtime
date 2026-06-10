/**
 * Vendor onboarding service.
 *
 * Drives the manager+ onboarding wizard: from the answers a manager collects
 * off the consignment contract, it (1) creates the TT vendor record, (2) records
 * the consignment agreement against the standard template with those terms, and
 * (3) opens a data-entry task that walks the manager through adding the vendor in
 * the NRS web UI (field-by-field, pre-filled with the values we just captured).
 *
 * The vendor is created `inactive` with no `nrsVendorId` — NRS assigns that when
 * the manager keys the vendor in, and the task asks them to record it back.
 *
 * All three writes happen in one transaction so a half-onboarded vendor can't
 * exist. NRS itself is touched read-only elsewhere (sync); nothing here writes
 * to NRS.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { vendors, agreementTemplates, vendorAgreements, tasks } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:vendor-onboarding');

function dollars(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

export const CONSIGNMENT_TEMPLATE_CODE = 'consignment-agreement';

// Commission split from the standard consignment contract (section 3). NRS stores
// the vendor's *payment* percent (what they keep), so 87% for booth rentals.
export const BOOTH_RENTAL_COMMISSION_PERCENT = 13;
export const INDIVIDUAL_ITEM_COMMISSION_PERCENT = 25;

export interface OnboardingInput {
	// Vendor & contact
	displayName: string;
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	addressLine1?: string | null;
	addressLine2?: string | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
	// Contract terms
	boothNumber?: string | null;
	boothSizeSqft?: number | null;
	monthlyRentCents?: number | null;
	customCabinetRentCents?: number | null;
	standardDiscountPercent?: number | null;
	maxDiscountPercent?: string | null; // decimal as string
	preferredPayoutMethod?: string | null;
	startDate?: string | null; // YYYY-MM-DD
	notes?: string | null;
}

export interface OnboardingResult {
	vendorId: string;
	agreementId: string;
	taskId: string;
}

function str(v: string | null | undefined): string | null {
	const t = (v ?? '').trim();
	return t.length ? t : null;
}

/**
 * Build the NRS data-entry checklist for a vendor. Field names mirror the live
 * NRS AP Vendor Management form (frmHead*) so a manager can map TT → NRS 1:1.
 * Whether a vendor is "pass-through" is a judgment, so it's phrased as guidance.
 */
export function buildNrsTaskDescription(input: OnboardingInput): string {
	const rentDollars = input.monthlyRentCents ? dollars(input.monthlyRentCents) : '(none)';
	const lines = [
		`Add this vendor in NRS (AP → Vendor Management → new vendor), then record the NRS Vendor ID back in TeamTime.`,
		``,
		`Copy these values into the NRS vendor form:`,
		``,
		`• Name: ${str(input.displayName) ?? ''}`,
		`• Address: ${str(input.addressLine1) ?? ''}`,
		...(str(input.addressLine2) ? [`• Address 2: ${str(input.addressLine2)}`] : []),
		`• City / State / Zip: ${[str(input.city), str(input.state), str(input.zip)].filter(Boolean).join(', ') || ''}`,
		`• Contact: ${str(input.contactName) ?? ''}`,
		`• Email: ${str(input.contactEmail) ?? ''}`,
		`• Phone: ${str(input.contactPhone) ?? ''}`,
		`• Booth Rent: ${rentDollars}`,
		`• Is a Pass-Through Vendor: Yes for consignment/booth vendors (leave unchecked only for buy-outright vendors).`,
		`• Vendor Payment %: ${100 - BOOTH_RENTAL_COMMISSION_PERCENT} for booth rentals (13% commission) / ${100 - INDIVIDUAL_ITEM_COMMISSION_PERCENT} for individual-item consignment (25% commission).`,
		`• A/R Customer: set this if the vendor pays booth rent (links rent billing).`,
		`• Enable Portal Access: check if this vendor will use the TeamTime vendor portal.`,
		`• Require 1099 / Federal ID: per accounting policy for paid vendors.`,
		``,
		`After saving in NRS:`,
		`1. Note the assigned NRS Vendor ID.`,
		`2. In TeamTime, open the vendor and set the NRS Vendor ID (or run "Sync from NRS").`,
		`3. Set the inventory code prefix and group in the onboarding queue.`,
		``,
		`Record the NRS Vendor ID in the completion notes for this task.`
	];
	return lines.join('\n');
}

export async function onboardVendor(
	input: OnboardingInput,
	createdByUserId: string
): Promise<OnboardingResult> {
	const displayName = str(input.displayName);
	if (!displayName) throw new Error('Vendor name is required');

	return db.transaction(async (tx) => {
		// 1. Vendor record — inactive until live in NRS, no nrsVendorId yet.
		const [vendor] = await tx
			.insert(vendors)
			.values({
				displayName,
				contactName: str(input.contactName),
				contactEmail: str(input.contactEmail),
				contactPhone: str(input.contactPhone),
				addressLine1: str(input.addressLine1),
				addressLine2: str(input.addressLine2),
				city: str(input.city),
				state: str(input.state),
				zip: str(input.zip),
				boothNumber: str(input.boothNumber),
				monthlyRentCents: input.monthlyRentCents ?? null,
				maxDiscountPercent: str(input.maxDiscountPercent),
				startDate: str(input.startDate),
				notes: str(input.notes),
				status: 'inactive',
				createdByUserId
			})
			.returning();

		// 2. Consignment agreement against the standard template, with the
		// collected terms snapshotted. Marked paper-original-on-file: the printed
		// contract is wet-signed and the scan uploaded afterward.
		const [template] = await tx
			.select()
			.from(agreementTemplates)
			.where(and(eq(agreementTemplates.code, CONSIGNMENT_TEMPLATE_CODE), eq(agreementTemplates.isActive, true)))
			.limit(1);
		if (!template) {
			throw new Error(
				`Active "${CONSIGNMENT_TEMPLATE_CODE}" template not found — seed it with scripts/seed-consignment-agreement.mjs`
			);
		}

		const [agreement] = await tx
			.insert(vendorAgreements)
			.values({
				vendorId: vendor.id,
				templateId: template.id,
				status: 'signed',
				signedByName: str(input.contactName) ?? displayName,
				signatureDataUrl: null,
				paperOriginalOnFile: true,
				bodySnapshot: template.bodyMarkdown,
				templateVersion: template.version,
				termsSnapshot: {
					monthlyRentCents: input.monthlyRentCents ?? null,
					maxDiscountPercent: str(input.maxDiscountPercent),
					boothNumber: str(input.boothNumber),
					extraFieldValues: {
						standard_discount_percent: input.standardDiscountPercent ?? null,
						booth_size_sqft: input.boothSizeSqft ?? null,
						custom_cabinet_rent: input.customCabinetRentCents ?? null,
						preferred_payout_method: str(input.preferredPayoutMethod)
					}
				},
				witnessedByUserId: createdByUserId
			})
			.returning();

		// 3. NRS data-entry task assigned to the manager running onboarding.
		const [task] = await tx
			.insert(tasks)
			.values({
				title: `Add vendor in NRS: ${displayName}`,
				description: buildNrsTaskDescription(input),
				assignedTo: createdByUserId,
				assignmentType: 'individual',
				priority: 'high',
				status: 'not_started',
				photoRequired: false,
				notesRequired: true, // capture the assigned NRS Vendor ID
				source: 'manual',
				createdBy: createdByUserId
			})
			.returning();

		log.info(
			{ vendorId: vendor.id, agreementId: agreement.id, taskId: task.id, createdByUserId },
			'Onboarded vendor (record + agreement + NRS task)'
		);

		return { vendorId: vendor.id, agreementId: agreement.id, taskId: task.id };
	});
}
