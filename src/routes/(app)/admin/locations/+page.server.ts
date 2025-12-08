import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, locations, storeHours } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { isManager, canManageLocations } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canManageLocations(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allLocations = await db
		.select()
		.from(locations)
		.orderBy(locations.name);

	const allStoreHours = await db
		.select()
		.from(storeHours)
		.orderBy(storeHours.dayOfWeek);

	return {
		locations: allLocations,
		storeHours: allStoreHours
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!canManageLocations(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const address = formData.get('address') as string;
		const lat = formData.get('lat') as string;
		const lng = formData.get('lng') as string;

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			await db.insert(locations).values({
				name,
				address: address || null,
				lat: lat || null,
				lng: lng || null
			});

			return { success: true, message: 'Location created successfully' };
		} catch (error) {
			console.error('Error creating location:', error);
			return fail(500, { error: 'Failed to create location' });
		}
	},

	update: async ({ request, locals }) => {
		if (!canManageLocations(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const locationId = formData.get('locationId') as string;
		const name = formData.get('name') as string;
		const address = formData.get('address') as string;
		const lat = formData.get('lat') as string;
		const lng = formData.get('lng') as string;
		const isActive = formData.get('isActive') === 'true';

		if (!locationId || !name) {
			return fail(400, { error: 'Location ID and name are required' });
		}

		try {
			await db
				.update(locations)
				.set({
					name,
					address: address || null,
					lat: lat || null,
					lng: lng || null,
					isActive,
					updatedAt: new Date()
				})
				.where(eq(locations.id, locationId));

			return { success: true, message: 'Location updated successfully' };
		} catch (error) {
			console.error('Error updating location:', error);
			return fail(500, { error: 'Failed to update location' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!canManageLocations(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const locationId = formData.get('locationId') as string;

		if (!locationId) {
			return fail(400, { error: 'Location ID required' });
		}

		try {
			await db.delete(locations).where(eq(locations.id, locationId));
			return { success: true, message: 'Location deleted successfully' };
		} catch (error) {
			console.error('Error deleting location:', error);
			return fail(500, { error: 'Failed to delete location' });
		}
	},

	updateStoreHours: async ({ request, locals }) => {
		if (!canManageLocations(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const locationId = formData.get('locationId') as string;

		if (!locationId) {
			return fail(400, { error: 'Location ID required' });
		}

		try {
			// Process each day of the week (0-6)
			for (let day = 0; day <= 6; day++) {
				const isClosed = formData.get(`day_${day}_closed`) === 'true';
				const openTime = formData.get(`day_${day}_open`) as string;
				const closeTime = formData.get(`day_${day}_close`) as string;

				// Check if record exists
				const existing = await db
					.select()
					.from(storeHours)
					.where(and(
						eq(storeHours.locationId, locationId),
						eq(storeHours.dayOfWeek, day)
					))
					.limit(1);

				if (existing.length > 0) {
					// Update existing
					await db
						.update(storeHours)
						.set({
							openTime: isClosed ? null : (openTime || null),
							closeTime: isClosed ? null : (closeTime || null),
							isClosed,
							updatedAt: new Date()
						})
						.where(eq(storeHours.id, existing[0].id));
				} else {
					// Insert new
					await db.insert(storeHours).values({
						locationId,
						dayOfWeek: day,
						openTime: isClosed ? null : (openTime || null),
						closeTime: isClosed ? null : (closeTime || null),
						isClosed
					});
				}
			}

			return { success: true, message: 'Store hours updated successfully' };
		} catch (error) {
			console.error('Error updating store hours:', error);
			return fail(500, { error: 'Failed to update store hours' });
		}
	}
};
