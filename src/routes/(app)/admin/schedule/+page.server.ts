import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users, shifts, locations } from '$lib/server/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get date range from query params or default to current week
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');

	const now = new Date();
	const startOfWeek = startParam ? new Date(startParam) : new Date(now);
	if (!startParam) {
		startOfWeek.setDate(now.getDate() - now.getDay());
		startOfWeek.setHours(0, 0, 0, 0);
	}

	const endOfWeek = endParam ? new Date(endParam) : new Date(startOfWeek);
	if (!endParam) {
		endOfWeek.setDate(startOfWeek.getDate() + 7);
	}

	// Get all shifts in range
	const allShifts = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			userName: users.name,
			locationId: shifts.locationId,
			locationName: locations.name,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes
		})
		.from(shifts)
		.innerJoin(users, eq(shifts.userId, users.id))
		.leftJoin(locations, eq(shifts.locationId, locations.id))
		.where(and(
			gte(shifts.startTime, startOfWeek),
			lte(shifts.startTime, endOfWeek)
		))
		.orderBy(shifts.startTime);

	// Get all active users and locations for dropdowns
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	const allLocations = await db
		.select({
			id: locations.id,
			name: locations.name
		})
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	return {
		shifts: allShifts,
		users: allUsers,
		locations: allLocations,
		startDate: startOfWeek.toISOString().split('T')[0],
		endDate: endOfWeek.toISOString().split('T')[0]
	};
};

export const actions: Actions = {
	createShift: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const locationId = formData.get('locationId') as string;
		const startTime = formData.get('startTime') as string;
		const endTime = formData.get('endTime') as string;
		const notes = formData.get('notes') as string;

		if (!userId || !startTime || !endTime) {
			return fail(400, { error: 'User, start time, and end time are required' });
		}

		try {
			await db.insert(shifts).values({
				userId,
				locationId: locationId || null,
				startTime: new Date(startTime),
				endTime: new Date(endTime),
				notes: notes || null,
				createdBy: locals.user?.id
			});

			return { success: true, message: 'Shift created successfully' };
		} catch (error) {
			console.error('Error creating shift:', error);
			return fail(500, { error: 'Failed to create shift' });
		}
	},

	deleteShift: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const shiftId = formData.get('shiftId') as string;

		if (!shiftId) {
			return fail(400, { error: 'Shift ID required' });
		}

		try {
			await db.delete(shifts).where(eq(shifts.id, shiftId));
			return { success: true, message: 'Shift deleted successfully' };
		} catch (error) {
			console.error('Error deleting shift:', error);
			return fail(500, { error: 'Failed to delete shift' });
		}
	}
};
