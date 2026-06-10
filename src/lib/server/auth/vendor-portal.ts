import { db, userTypes } from '$lib/server/db';
import { eq } from 'drizzle-orm';

/**
 * Vendor-portal users are confined to /vendor/* by the (app) layout, but API
 * routes do not sit under that layout — any API that serves staff-scoped data
 * must check this itself and scope or deny accordingly.
 *
 * Mirrors the (app) layout's detection (userTypes row named 'Vendor'). Keep
 * this as the single implementation so the layout and APIs cannot drift.
 */
export async function isVendorPortalUser(user: {
	id: string;
	userTypeId?: string | null;
}): Promise<boolean> {
	if (!user.userTypeId) return false;
	const [t] = await db
		.select({ name: userTypes.name })
		.from(userTypes)
		.where(eq(userTypes.id, user.userTypeId))
		.limit(1);
	return t?.name === 'Vendor';
}
