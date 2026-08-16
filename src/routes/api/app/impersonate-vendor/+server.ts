import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, vendors, users } from '$lib/server/db';
import { lucia } from '$lib/server/auth';
import { isManager } from '$lib/server/auth/roles';
import { audit } from '$lib/server/services/audit-service';

/**
 * POST /api/app/impersonate-vendor { vendorId } — a manager mints a session that
 * ACTS AS that vendor's portal user, so the label app's staff mode gets the FULL
 * vendor experience (history, inventory, queue, header, create, reprint) for the
 * chosen vendor via the normal vendor endpoints.
 *
 * Manager-gated. Fails if the vendor has no linked portal user (not onboarded) —
 * that vendor simply won't appear in the staff dropdown. Returns { token,
 * cookieName } like /api/app/login, so the app swaps its session to the vendor's.
 */
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = (await request.json().catch(() => ({}))) as { vendorId?: string };
	const vendorId = body.vendorId?.toString();
	if (!vendorId) return json({ error: 'vendorId required' }, { status: 400 });

	const [vendor] = await db
		.select({ userId: vendors.userId, displayName: vendors.displayName })
		.from(vendors)
		.where(eq(vendors.id, vendorId))
		.limit(1);
	if (!vendor) return json({ error: 'Vendor not found' }, { status: 404 });
	if (!vendor.userId) return json({ error: 'Vendor is not onboarded to the portal' }, { status: 409 });

	const [u] = await db
		.select({ isActive: users.isActive })
		.from(users)
		.where(eq(users.id, vendor.userId))
		.limit(1);
	if (!u || !u.isActive) return json({ error: 'Vendor user is inactive' }, { status: 409 });

	// contextVendorId does two things, both load-bearing:
	//   1. It PINS the session to this vendor, so a portal user who owns several vendor
	//      accounts is never resolved arbitrarily by the vendor endpoints.
	//   2. Its presence tells hooks.server.ts to de-privilege the session to vendor-only
	//      rights. Some vendors are linked to staff/admin logins, so an un-clamped
	//      impersonation session would carry that user's real role.
	// Do NOT "fix" this by refusing to impersonate an admin — the owner legitimately
	// holds the house vendor accounts. The clamp belongs on the session, not the user.
	const session = await lucia.createSession(vendor.userId, {
		deviceFingerprint: 'desktop-label-app-staff-impersonation',
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? 'desktop-label-app-staff',
		lastActive: new Date(),
		last2faAt: new Date(),
		contextVendorId: vendorId
	});

	await audit({
		userId: locals.user.id,
		action: 'vendor.impersonate',
		entityType: 'vendor',
		entityId: vendorId,
		ipAddress: getClientAddress(),
		metadata: {
			vendorName: vendor.displayName,
			actingAsUserId: vendor.userId,
			sessionId: session.id
		}
	});

	return json({
		token: session.id,
		cookieName: lucia.sessionCookieName,
		vendorId,
		vendorName: vendor.displayName
	});
};
