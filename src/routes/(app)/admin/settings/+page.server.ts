import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const settings = await db.select().from(appSettings);

	const settingsMap: Record<string, string> = {};
	for (const s of settings) {
		settingsMap[s.key] = s.value;
	}

	return { settings: settingsMap };
};

async function toggleSetting(locals: App.Locals, key: string) {
	if (!isManager(locals.user)) {
		return fail(403, { error: 'Unauthorized' });
	}

	const [current] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, key))
		.limit(1);

	const newValue = current?.value === 'true' ? 'false' : 'true';

	if (current) {
		await db
			.update(appSettings)
			.set({ value: newValue, updatedAt: new Date() })
			.where(eq(appSettings.key, key));
	} else {
		await db.insert(appSettings).values({
			key,
			value: newValue
		});
	}

	return { success: true, newValue: newValue === 'true' };
}

export const actions: Actions = {
	toggleModule: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const moduleKey = formData.get('module')?.toString();
		if (!moduleKey) return fail(400, { error: 'Module key required' });

		// Load current module settings
		const [current] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'enabled_modules'))
			.limit(1);

		let modules: Record<string, boolean> = {};
		if (current) {
			try { modules = JSON.parse(current.value); } catch { /* empty */ }
		}

		// Toggle the module
		modules[moduleKey] = modules[moduleKey] === false ? true : false;

		const newValue = JSON.stringify(modules);
		if (current) {
			await db
				.update(appSettings)
				.set({ value: newValue, updatedAt: new Date() })
				.where(eq(appSettings.key, 'enabled_modules'));
		} else {
			await db.insert(appSettings).values({
				key: 'enabled_modules',
				value: newValue
			});
		}

		return { success: true };
	},

	toggle2FA: async ({ locals }) => {
		return toggleSetting(locals, '2fa_enabled');
	},

	togglePinOnlyLogin: async ({ locals }) => {
		return toggleSetting(locals, 'pin_only_login');
	},

	toggleLaborCost: async ({ locals }) => {
		return toggleSetting(locals, 'show_labor_cost');
	},

	toggleManagerPinReset: async ({ locals }) => {
		return toggleSetting(locals, 'managers_can_reset_pins');
	},

	updateSiteTitle: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const siteTitle = formData.get('siteTitle')?.toString().trim();

		if (!siteTitle) {
			return fail(400, { error: 'Site title is required' });
		}

		const [existing] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'site_title'))
			.limit(1);

		if (existing) {
			await db
				.update(appSettings)
				.set({ value: siteTitle, updatedAt: new Date() })
				.where(eq(appSettings.key, 'site_title'));
		} else {
			await db.insert(appSettings).values({
				key: 'site_title',
				value: siteTitle
			});
		}

		return { success: true };
	}
};
