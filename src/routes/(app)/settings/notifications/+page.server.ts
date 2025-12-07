import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, pushSubscriptions } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const subscriptions = await db
		.select({
			id: pushSubscriptions.id,
			deviceInfo: pushSubscriptions.deviceInfo,
			createdAt: pushSubscriptions.createdAt
		})
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, locals.user.id));

	return { subscriptions };
};

export const actions: Actions = {
	unsubscribe: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const subscriptionId = formData.get('subscriptionId')?.toString();

		if (!subscriptionId) {
			return fail(400, { error: 'Subscription ID required' });
		}

		await db
			.delete(pushSubscriptions)
			.where(eq(pushSubscriptions.id, subscriptionId));

		return { success: true };
	}
};
