import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, userTypes, appSettings, vendors, userExtraRoles } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

// Default module states - all enabled
const DEFAULT_MODULES: Record<string, boolean> = {
	tasks: true,
	schedule: true,
	messages: true,
	expenses: true,
	purchase_requests: true,
	notifications: true,
	locations: true,
	reports: true,
	leaderboard: true,
	achievements: true,
	sales: true,
	pricing: true,
	inventory: true,
	ebay: true
};

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Vendor portal users can only see /vendor/* — redirect them away from
	// staff routes. Logout is handled by /logout (top-level, outside this layout).
	let isVendor = false;
	if (locals.user.userTypeId) {
		const [type] = await db
			.select({ name: userTypes.name })
			.from(userTypes)
			.where(eq(userTypes.id, locals.user.userTypeId))
			.limit(1);
		if (type?.name === 'Vendor') {
			isVendor = true;
			const path = url.pathname;
			if (!path.startsWith('/vendor')) {
				throw redirect(302, '/vendor');
			}
			// Confirm the vendor record is still portal-enabled. If not, sign-out feel.
			const [vendor] = await db
				.select({ id: vendors.id })
				.from(vendors)
				.where(and(eq(vendors.userId, locals.user.id), eq(vendors.portalEnabled, true)))
				.limit(1);
			if (!vendor) {
				throw redirect(302, '/login');
			}
		}
	}

	// Fetch additional user data not stored in session
	const [userData] = await db
		.select({ canListOnEbay: users.canListOnEbay })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

	// Load module settings
	const [moduleSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'enabled_modules'));

	let enabledModules = { ...DEFAULT_MODULES };
	if (moduleSetting) {
		try {
			const saved = JSON.parse(moduleSetting.value);
			enabledModules = { ...DEFAULT_MODULES, ...saved };
		} catch {
			// Use defaults on parse error
		}
	}

	// Staff who are *also* linked to a vendor get a separate signal so the
	// sidebar can offer a "Vendor Portal" entry. Distinct from isVendor (which
	// means vendor-only — no staff UI). Only meaningful when isVendor is false.
	let hasVendorAccess = false;
	if (!isVendor) {
		const [vendorRole] = await db
			.select({ userId: userExtraRoles.userId })
			.from(userExtraRoles)
			.where(and(eq(userExtraRoles.userId, locals.user.id), eq(userExtraRoles.role, 'vendor')))
			.limit(1);
		// Also confirm the vendor record itself is still portal-enabled — the
		// extra-role can outlive the link if disablePortal failed mid-way.
		if (vendorRole) {
			const [vendor] = await db
				.select({ id: vendors.id })
				.from(vendors)
				.where(and(eq(vendors.userId, locals.user.id), eq(vendors.portalEnabled, true)))
				.limit(1);
			hasVendorAccess = !!vendor;
		}
	}

	return {
		user: locals.user,
		canListOnEbay: userData?.canListOnEbay || false,
		enabledModules,
		isVendor,
		hasVendorAccess
	};
};
