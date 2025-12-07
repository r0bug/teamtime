import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, appSettings } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	const settings = await db.select().from(appSettings);

	const settingsMap: Record<string, string> = {};
	for (const s of settings) {
		settingsMap[s.key] = s.value;
	}

	return { settings: settingsMap };
};

export const actions: Actions = {
	toggle2FA: async ({ locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const [current] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, '2fa_enabled'))
			.limit(1);

		const newValue = current?.value === 'true' ? 'false' : 'true';

		if (current) {
			await db
				.update(appSettings)
				.set({ value: newValue, updatedAt: new Date() })
				.where(eq(appSettings.key, '2fa_enabled'));
		} else {
			await db.insert(appSettings).values({
				key: '2fa_enabled',
				value: newValue
			});
		}

		return { success: true, twoFAEnabled: newValue === 'true' };
	}
};
