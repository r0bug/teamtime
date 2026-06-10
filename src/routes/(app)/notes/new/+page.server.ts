import type { PageServerLoad } from './$types';
import { db, users, vendors } from '$lib/server/db';
import { eq, asc, and, isNotNull } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	// Vendors that can log in to the portal (and so can actually receive a note).
	const vendorRows = await db
		.select({ userId: vendors.userId, displayName: vendors.displayName })
		.from(vendors)
		.where(and(eq(vendors.portalEnabled, true), isNotNull(vendors.userId)))
		.orderBy(asc(vendors.displayName));

	const vendorUserIds = new Set(vendorRows.map((v) => v.userId));

	// Staff = active users who are not vendor-portal accounts.
	const staffRows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name));
	const staff = staffRows.filter((u) => !vendorUserIds.has(u.id));

	const vendorList = vendorRows.map((v) => ({ userId: v.userId as string, displayName: v.displayName }));

	return { staff, vendors: vendorList };
};
