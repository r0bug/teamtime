import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db, gamificationConfig } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { POINT_VALUES, STREAK_MULTIPLIERS, STREAK_BONUSES, LEVEL_THRESHOLDS } from '$lib/server/services/points-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Admin access required');
	}

	// Load all config from DB
	const configs = await db.select().from(gamificationConfig);
	const configMap: Record<string, string> = {};
	for (const c of configs) {
		configMap[c.key] = c.value;
	}

	return {
		configs: configMap,
		defaults: {
			pointValues: POINT_VALUES,
			streakMultipliers: STREAK_MULTIPLIERS,
			streakBonuses: STREAK_BONUSES,
			levelThresholds: LEVEL_THRESHOLDS
		}
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			throw error(403, 'Admin access required');
		}

		const formData = await request.formData();
		const entries: Array<{ key: string; value: string; category: string; description: string }> = [];

		// Parse all form fields as config entries
		for (const [key, value] of formData.entries()) {
			if (key.startsWith('config_')) {
				const configKey = key.replace('config_', '');
				const category = formData.get(`category_${configKey}`) as string || 'points';
				const description = formData.get(`desc_${configKey}`) as string || '';
				entries.push({ key: configKey, value: value.toString(), category, description });
			}
		}

		// Upsert all config entries
		for (const entry of entries) {
			await db
				.insert(gamificationConfig)
				.values({
					key: entry.key,
					value: entry.value,
					category: entry.category,
					description: entry.description
				})
				.onConflictDoUpdate({
					target: [gamificationConfig.key],
					set: {
						value: entry.value,
						category: entry.category,
						description: entry.description,
						updatedAt: new Date()
					}
				});
		}

		return { success: true };
	}
};
