import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';

// Define available modules
const AVAILABLE_MODULES = [
	{ key: 'module_tasks', name: 'Tasks', description: 'Task management and assignments' },
	{ key: 'module_schedule', name: 'Schedule', description: 'Shift scheduling and time tracking' },
	{ key: 'module_messages', name: 'Messages', description: 'Internal messaging system' },
	{ key: 'module_expenses', name: 'Expenses', description: 'ATM withdrawals and expense tracking' },
	{ key: 'module_purchases', name: 'Purchase Requests', description: 'Purchase approval workflow' },
	{ key: 'module_notifications', name: 'Notifications', description: 'Push notifications and alerts' },
	{ key: 'module_locations', name: 'Locations', description: 'Location management' },
	{ key: 'module_reports', name: 'Reports', description: 'Analytics and reporting' }
];

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get current module settings
	const settings = await db.select().from(appSettings);
	const settingsMap = new Map(settings.map(s => [s.key, s.value]));

	const modules = AVAILABLE_MODULES.map(module => ({
		...module,
		enabled: settingsMap.get(module.key) !== 'false'
	}));

	return { modules };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const moduleKey = formData.get('moduleKey')?.toString();
		const enabled = formData.get('enabled') === 'true';

		if (!moduleKey) {
			return fail(400, { error: 'Module key is required' });
		}

		// Check if setting exists
		const existing = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, moduleKey))
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(appSettings)
				.set({ value: enabled ? 'true' : 'false', updatedAt: new Date() })
				.where(eq(appSettings.key, moduleKey));
		} else {
			await db.insert(appSettings).values({
				key: moduleKey,
				value: enabled ? 'true' : 'false'
			});
		}

		return { success: true };
	}
};
