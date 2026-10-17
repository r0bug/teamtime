import type { LayoutServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { getPortalContext } from '$lib/server/services/payout-group-service';
import { listPinnedAnnouncements } from '$lib/server/services/vendor-announcements-service';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');

	// A parent vendor's login acts for its NRS pass-through children too;
	// a child's own login has no portal (NRS pays them through the parent).
	const ctx = await getPortalContext(locals.user.id);
	const vendor = ctx?.vendor;
	if (!ctx || !vendor) {
		// Either not a vendor portal user or portal access has been disabled.
		// The parent (app)/+layout.server.ts already filters non-vendor users
		// away from /vendor; this is the safety net for portal-disabled cases.
		throw error(403, 'Vendor portal access is not enabled for your account');
	}

	// Force the vendor to set their own password before reaching any portal
	// page. The flag is set when admin sends them temp credentials; cleared
	// when they save a new password at /vendor/set-password.
	if (locals.user.mustChangePassword && url.pathname !== '/vendor/set-password') {
		throw redirect(302, '/vendor/set-password');
	}

	return {
		vendor,
		/** Every vendor account this login may act for (primary first). Pages pick one via ?v=<id>. */
		members: ctx.members.map((m) => ({ id: m.id, displayName: m.displayName, inventoryCodePrefix: m.inventoryCodePrefix, nrsVendorId: m.nrsVendorId, isPrimary: m.id === vendor.id })),
		mustChangePassword: locals.user.mustChangePassword === true,
		pinnedAnnouncements: await listPinnedAnnouncements()
	};
};
