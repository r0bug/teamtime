import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isAdmin, canManageModules } from '$lib/server/auth/roles';

const DEFAULT_MODULES = [
	{ key: 'module_tasks', name: 'Tasks', description: 'Task management and assignments', enabled: true },
	{ key: 'module_schedule', name: 'Schedule', description: 'Shift scheduling and time tracking', enabled: true },
	{ key: 'module_messages', name: 'Messages', description: 'Internal messaging system', enabled: true },
	{ key: 'module_expenses', name: 'Expenses', description: 'ATM withdrawals and expense tracking', enabled: true },
	{ key: 'module_purchase_requests', name: 'Purchase Requests', description: 'Purchase approval workflow', enabled: true },
	{ key: 'module_notifications', name: 'Notifications', description: 'Push notifications and alerts', enabled: true },
	{ key: 'module_locations', name: 'Locations', description: 'Location management', enabled: true },
	{ key: 'module_reports', name: 'Reports', description: 'Analytics and reporting', enabled: true }
];

export const load: PageServerLoad = async ({ locals }) => {
	if (!canManageModules(locals.user)) {
		throw redirect(302, '/admin');
	}

	// Get current module settings
	const settings = await db
		.select()
		.from(appSettings);

	const settingsMap = settings.reduce((acc, setting) => {
		acc[setting.key] = setting.value;
		return acc;
	}, {} as Record<string, string>);

	// Merge with defaults
	const modules = DEFAULT_MODULES.map(module => ({
		...module,
		enabled: settingsMap[module.key] !== 'false'
	}));

	return {
		modules
	};
};

export const actions: Actions = {
	toggleModule: async ({ request, locals }) => {
		if (!canManageModules(locals.user)) {
			return fail(403, { error: 'Only admins can manage modules' });
		}

		const formData = await request.formData();
		const moduleKey = formData.get('moduleKey') as string;
		const enabled = formData.get('enabled') === 'true';

		if (!moduleKey) {
			return fail(400, { error: 'Module key required' });
		}

		try {
			// Upsert the setting
			await db
				.insert(appSettings)
				.values({
					key: moduleKey,
					value: enabled ? 'true' : 'false'
				})
				.onConflictDoUpdate({
					target: appSettings.key,
					set: {
						value: enabled ? 'true' : 'false',
						updatedAt: new Date()
					}
				});

			return { success: true, message: 'Module setting updated' };
		} catch (error) {
			console.error('Error updating module:', error);
			return fail(500, { error: 'Failed to update module setting' });
		}
	}
};
