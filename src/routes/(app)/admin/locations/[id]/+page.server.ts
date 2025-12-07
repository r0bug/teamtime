import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, params.id))
		.limit(1);

	if (!location) {
		throw error(404, 'Location not found');
	}

	return { location };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const address = formData.get('address')?.toString().trim() || null;
		const lat = formData.get('lat')?.toString();
		const lng = formData.get('lng')?.toString();
		const isActive = formData.get('isActive') === 'on';

		if (!name) {
			return fail(400, { error: 'Location name is required' });
		}

		await db
			.update(locations)
			.set({
				name,
				address,
				lat: lat ? lat : null,
				lng: lng ? lng : null,
				isActive,
				updatedAt: new Date()
			})
			.where(eq(locations.id, params.id));

		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		await db.delete(locations).where(eq(locations.id, params.id));

		throw redirect(302, '/admin/locations');
	}
};
