import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';

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

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
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

	return {
		user: locals.user,
		canListOnEbay: userData?.canListOnEbay || false,
		enabledModules
	};
};
