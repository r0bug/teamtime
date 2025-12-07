import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, locations } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	return {};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const address = formData.get('address')?.toString().trim() || null;
		const lat = formData.get('lat')?.toString();
		const lng = formData.get('lng')?.toString();

		if (!name) {
			return fail(400, { error: 'Location name is required' });
		}

		await db.insert(locations).values({
			name,
			address,
			lat: lat ? lat : null,
			lng: lng ? lng : null,
			isActive: true
		});

		throw redirect(302, '/admin/locations');
	}
};
