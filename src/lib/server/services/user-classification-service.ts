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
