import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, socialMediaConfigs, socialMediaSubmissions, users } from '$lib/server/db';
import { eq, desc, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import type { SocialMediaField } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		throw redirect(302, '/');
	}

	// Get all configs with submission counts
	const configs = await db
		.select({
			id: socialMediaConfigs.id,
			name: socialMediaConfigs.name,
			platform: socialMediaConfigs.platform,
			fields: socialMediaConfigs.fields,
			requireUrl: socialMediaConfigs.requireUrl,
			requireScreenshot: socialMediaConfigs.requireScreenshot,
			isActive: socialMediaConfigs.isActive,
			createdAt: socialMediaConfigs.createdAt
		})
		.from(socialMediaConfigs)
		.orderBy(desc(socialMediaConfigs.createdAt));

	// Get recent submissions
	const recentSubmissions = await db
		.select({
			id: socialMediaSubmissions.id,
			postUrl: socialMediaSubmissions.postUrl,
			values: socialMediaSubmissions.values,
			notes: socialMediaSubmissions.notes,
			submittedAt: socialMediaSubmissions.submittedAt,
			userName: users.name,
			configName: socialMediaConfigs.name,
			platform: socialMediaConfigs.platform
		})
		.from(socialMediaSubmissions)
		.leftJoin(users, eq(socialMediaSubmissions.userId, users.id))
		.leftJoin(socialMediaConfigs, eq(socialMediaSubmissions.configId, socialMediaConfigs.id))
		.orderBy(desc(socialMediaSubmissions.submittedAt))
		.limit(20);

	// Get submission count per config
	const submissionCounts = await db
		.select({
			configId: socialMediaSubmissions.configId,
			count: sql<number>`count(*)::int`
		})
		.from(socialMediaSubmissions)
		.groupBy(socialMediaSubmissions.configId);

	const countsMap = new Map(submissionCounts.map(s => [s.configId, s.count]));

	return {
		configs: configs.map(c => ({
			...c,
			submissionCount: countsMap.get(c.id) || 0
		})),
		recentSubmissions
	};
};

// Default metric templates per platform
const platformTemplates: Record<string, SocialMediaField[]> = {
	instagram: [
		{ name: 'likes', label: 'Likes', type: 'integer', required: true, order: 1 },
		{ name: 'comments', label: 'Comments', type: 'integer', required: true, order: 2 },
		{ name: 'saves', label: 'Saves', type: 'integer', required: false, order: 3 },
		{ name: 'shares', label: 'Shares', type: 'integer', required: false, order: 4 },
		{ name: 'reach', label: 'Reach', type: 'integer', required: false, order: 5 },
		{ name: 'impressions', label: 'Impressions', type: 'integer', required: false, order: 6 }
	],
	facebook: [
		{ name: 'reactions', label: 'Reactions', type: 'integer', required: true, order: 1 },
		{ name: 'comments', label: 'Comments', type: 'integer', required: true, order: 2 },
		{ name: 'shares', label: 'Shares', type: 'integer', required: false, order: 3 },
		{ name: 'reach', label: 'Reach', type: 'integer', required: false, order: 4 },
		{ name: 'engagement_rate', label: 'Engagement Rate', type: 'percentage', required: false, order: 5 }
	],
	tiktok: [
		{ name: 'views', label: 'Views', type: 'integer', required: true, order: 1 },
		{ name: 'likes', label: 'Likes', type: 'integer', required: true, order: 2 },
		{ name: 'comments', label: 'Comments', type: 'integer', required: false, order: 3 },
		{ name: 'shares', label: 'Shares', type: 'integer', required: false, order: 4 },
		{ name: 'saves', label: 'Saves', type: 'integer', required: false, order: 5 }
	],
	youtube: [
		{ name: 'views', label: 'Views', type: 'integer', required: true, order: 1 },
		{ name: 'likes', label: 'Likes', type: 'integer', required: true, order: 2 },
		{ name: 'comments', label: 'Comments', type: 'integer', required: false, order: 3 },
		{ name: 'subscribers_gained', label: 'Subscribers Gained', type: 'integer', required: false, order: 4 }
	],
	twitter: [
		{ name: 'impressions', label: 'Impressions', type: 'integer', required: true, order: 1 },
		{ name: 'likes', label: 'Likes', type: 'integer', required: true, order: 2 },
		{ name: 'retweets', label: 'Retweets', type: 'integer', required: false, order: 3 },
		{ name: 'replies', label: 'Replies', type: 'integer', required: false, order: 4 },
		{ name: 'profile_clicks', label: 'Profile Clicks', type: 'integer', required: false, order: 5 }
	],
	other: [
		{ name: 'views', label: 'Views', type: 'integer', required: false, order: 1 },
		{ name: 'likes', label: 'Likes', type: 'integer', required: false, order: 2 },
		{ name: 'comments', label: 'Comments', type: 'integer', required: false, order: 3 },
		{ name: 'shares', label: 'Shares', type: 'integer', required: false, order: 4 }
	]
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const platform = formData.get('platform')?.toString() as 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'twitter' | 'other';
		const useTemplate = formData.get('useTemplate') === 'true';
		const customFieldsJson = formData.get('customFields')?.toString();

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		if (!platform) {
			return fail(400, { error: 'Platform is required' });
		}

		let fields: SocialMediaField[];
		if (useTemplate) {
			fields = platformTemplates[platform] || platformTemplates.other;
		} else if (customFieldsJson) {
			try {
				fields = JSON.parse(customFieldsJson);
			} catch {
				return fail(400, { error: 'Invalid custom fields JSON' });
			}
		} else {
			fields = platformTemplates[platform] || platformTemplates.other;
		}

		await db.insert(socialMediaConfigs).values({
			name,
			platform,
			fields,
			requireUrl: true,
			requireScreenshot: false,
			createdBy: locals.user.id
		});

		return { success: true, created: true };
	},

	toggleActive: async ({ request, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const configId = formData.get('configId')?.toString();

		if (!configId) {
			return fail(400, { error: 'Config ID required' });
		}

		// Get current state
		const [config] = await db.select({ isActive: socialMediaConfigs.isActive })
			.from(socialMediaConfigs)
			.where(eq(socialMediaConfigs.id, configId))
			.limit(1);

		if (!config) {
			return fail(404, { error: 'Config not found' });
		}

		await db.update(socialMediaConfigs)
			.set({ isActive: !config.isActive, updatedAt: new Date() })
			.where(eq(socialMediaConfigs.id, configId));

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user || !isManager(locals.user)) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const configId = formData.get('configId')?.toString();

		if (!configId) {
			return fail(400, { error: 'Config ID required' });
		}

		await db.delete(socialMediaConfigs).where(eq(socialMediaConfigs.id, configId));

		return { success: true, deleted: true };
	}
};
