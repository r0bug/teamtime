/**
 * User Classification Service
 *
 * TeamTime users are either STAFF (admin/manager/purchaser/staff who work
 * shifts, clock in, get scheduled) or VENDORS (booth sellers with a Vendor
 * user type and usually a row in `vendors`). The two must stay cleanly
 * delineated:
 *
 * - "All staff" broadcasts (SMS or in-app) must never include vendor users.
 * - Vendor users only get a phone number on their user record once their
 *   vendor onboarding is complete (vendors.onboarding_complete). Until then,
 *   contact info belongs on the vendor record, not the user.
 */

import { db, users, vendors, userTypes } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const VENDOR_USER_TYPE_NAME = 'Vendor';

/**
 * True if the user's custom user type is Vendor.
 */
export async function isVendorUser(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ typeName: userTypes.name })
		.from(users)
		.leftJoin(userTypes, eq(userTypes.id, users.userTypeId))
		.where(eq(users.id, userId))
		.limit(1);
	return row?.typeName === VENDOR_USER_TYPE_NAME;
}

/**
 * Active staff users for team-wide broadcasts: excludes vendors and admins.
 */
export async function getBroadcastStaff(): Promise<
	{ id: string; name: string; phone: string | null; role: string }[]
> {
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			role: users.role,
			typeName: userTypes.name
		})
		.from(users)
		.leftJoin(userTypes, eq(userTypes.id, users.userTypeId))
		.where(eq(users.isActive, true));

	return rows
		.filter((u) => u.role !== 'admin' && u.typeName !== VENDOR_USER_TYPE_NAME)
		.map(({ id, name, phone, role }) => ({ id, name, phone, role }));
}

/**
 * Active users who can be scheduled for shifts: everyone staff-side,
 * admins included, EXCLUDING Vendor-type users. Staff who also sell as
 * vendors keep a staff user type (the vendor link is an extra role), so
 * they remain schedulable.
 */
export async function getSchedulableStaff(): Promise<{ id: string; name: string; role: string }[]> {
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			typeName: userTypes.name
		})
		.from(users)
		.leftJoin(userTypes, eq(userTypes.id, users.userTypeId))
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	return rows
		.filter((u) => u.typeName !== VENDOR_USER_TYPE_NAME)
		.map(({ id, name, role }) => ({ id, name, role }));
}

/**
 * A vendor we can text, and which number we'd use.
 *
 * Vendors are reachable two ways. Onboarded vendors with a portal account have
 * a phone on their user record (see phoneNotAllowedReason — that's the only
 * point at which they get one). Everyone else — most of the roster, including
 * every paper-archive migration — only has vendors.contact_phone.
 *
 * The user record wins when both exist: it's the number tied to a login, so
 * it's the one that's been through onboarding.
 */
export interface VendorSmsTarget {
	vendorId: string;
	displayName: string;
	boothNumber: string | null;
	/** Raw stored phone — caller formats to E.164. Null when unreachable. */
	phone: string | null;
	source: 'user_account' | 'vendor_record' | null;
}

function toSmsTarget(row: {
	id: string;
	displayName: string;
	boothNumber: string | null;
	contactPhone: string | null;
	userPhone: string | null;
}): VendorSmsTarget {
	const phone = row.userPhone ?? row.contactPhone ?? null;
	return {
		vendorId: row.id,
		displayName: row.displayName,
		boothNumber: row.boothNumber,
		phone,
		source: phone === null ? null : row.userPhone ? 'user_account' : 'vendor_record'
	};
}

/** One vendor's SMS target, or null when no such vendor exists. */
export async function getVendorSmsTarget(vendorId: string): Promise<VendorSmsTarget | null> {
	const [row] = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			boothNumber: vendors.boothNumber,
			contactPhone: vendors.contactPhone,
			userPhone: users.phone
		})
		.from(vendors)
		.leftJoin(users, eq(users.id, vendors.userId))
		.where(eq(vendors.id, vendorId))
		.limit(1);

	return row ? toSmsTarget(row) : null;
}

/**
 * Every vendor we could text. Active-only by default — a broadcast should not
 * reach vendors who have left.
 */
export async function getVendorSmsTargets(
	opts: { activeOnly?: boolean } = {}
): Promise<VendorSmsTarget[]> {
	const activeOnly = opts.activeOnly !== false;

	const rows = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			boothNumber: vendors.boothNumber,
			contactPhone: vendors.contactPhone,
			userPhone: users.phone,
			status: vendors.status,
			nrsInactive: vendors.nrsInactive
		})
		.from(vendors)
		.leftJoin(users, eq(users.id, vendors.userId))
		.orderBy(vendors.displayName);

	return rows
		.filter((v) => !activeOnly || (v.status === 'active' && !v.nrsInactive))
		.map(toSmsTarget);
}

/**
 * May this user have a phone number on their user record?
 * Staff always can; vendor users only once onboarding is complete.
 * Returns null when allowed, or a human-readable reason when not.
 */
export async function phoneNotAllowedReason(userId: string): Promise<string | null> {
	if (!(await isVendorUser(userId))) return null;

	const [vendor] = await db
		.select({ onboardingComplete: vendors.onboardingComplete })
		.from(vendors)
		.where(eq(vendors.userId, userId))
		.limit(1);

	if (vendor?.onboardingComplete) return null;
	return 'Vendors get a phone number once fully onboarded. Complete vendor onboarding first, or keep contact info on the vendor record.';
}
