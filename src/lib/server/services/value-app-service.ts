/**
 * value.trickpc.com (photo appraisal tool) — TeamTime is its identity provider.
 *
 * The appraisal tool is a separate app on the hosting box. It never sees the
 * TeamTime DB; it learns who a user is in one of two ways, both keyed on the
 * shared secret VALUE_APP_SECRET:
 *
 *  1. SSO hop — a signed-in TeamTime user clicks "Appraisals"; /appraisals mints
 *     a short-lived HMAC token describing them and redirects to value.trickpc.com.
 *  2. Direct login on the phone — value.trickpc.com posts email + password/PIN to
 *     /api/app/value-verify (server-to-server, secret in a header).
 *     (Not /api/app/verify-credentials: that one is the ListFlow credential proxy.)
 *
 * `kind` is the only authorization signal the appraisal tool uses:
 * 'vendor' users see their own appraisals, 'staff' see everyone's.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db, users, userTypes, vendors } from '$lib/server/db';
import { VENDOR_USER_TYPE_NAME } from '$lib/server/services/user-classification-service';
import { getVendorForUser } from '$lib/server/services/vendor-service';

export const VALUE_APP_URL = 'https://value.trickpc.com';
const SSO_TTL_SECONDS = 120;

export interface ValueAppIdentity {
	userId: string;
	email: string;
	name: string;
	role: string;
	kind: 'staff' | 'vendor';
	vendorId: string | null;
	vendorName: string | null;
}

export function valueAppSecret(): string | null {
	const s = env.VALUE_APP_SECRET;
	return s && s.length >= 32 ? s : null;
}

/** Constant-time compare of a presented service key against VALUE_APP_SECRET. */
export function isValidServiceKey(presented: string | null): boolean {
	const secret = valueAppSecret();
	if (!secret || !presented) return false;
	const a = Buffer.from(presented);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Resolve the identity the appraisal tool should see, or null if the user may
 * not use it (inactive, or a Vendor-type user whose portal is disabled).
 * `forceVendor` is set for impersonated "acting as vendor" sessions.
 */
export async function getValueAppIdentity(
	userId: string,
	forceVendor = false
): Promise<ValueAppIdentity | null> {
	const [row] = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			isActive: users.isActive,
			typeName: userTypes.name
		})
		.from(users)
		.leftJoin(userTypes, eq(userTypes.id, users.userTypeId))
		.where(eq(users.id, userId))
		.limit(1);
	if (!row || !row.isActive) return null;

	const isVendorType = row.typeName === VENDOR_USER_TYPE_NAME;
	if (isVendorType) {
		// Same rule as the (app) layout: a vendor login only works while the
		// vendor record is portal-enabled.
		const [enabled] = await db
			.select({ id: vendors.id })
			.from(vendors)
			.where(and(eq(vendors.userId, row.id), eq(vendors.portalEnabled, true)))
			.limit(1);
		if (!enabled) return null;
	}

	const vendor = await getVendorForUser(row.id);
	return {
		userId: row.id,
		email: row.email,
		name: row.name,
		role: row.role,
		kind: isVendorType || forceVendor ? 'vendor' : 'staff',
		vendorId: vendor?.id ?? null,
		vendorName: vendor?.displayName ?? null
	};
}

/** base64url(JSON payload) + "." + base64url(HMAC-SHA256). Verified by value.trickpc.com. */
export function mintSsoToken(identity: ValueAppIdentity, secret: string): string {
	const payload = Buffer.from(
		JSON.stringify({ ...identity, exp: Math.floor(Date.now() / 1000) + SSO_TTL_SECONDS })
	).toString('base64url');
	const sig = createHmac('sha256', secret).update(payload).digest('base64url');
	return `${payload}.${sig}`;
}
