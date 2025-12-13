import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, shifts, users, locations } from '$lib/server/db';
import { eq, gte, lte, and, desc } from 'drizzle-orm';
import { parsePacificDatetime } from '$lib/server/utils/timezone';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || locals.user.role !== 'manager') {
		throw redirect(302, '/schedule');
	}

	const weekOffset = parseInt(url.searchParams.get('week') || '0', 10);
	const now = new Date();
	const weekStart = new Date(now);
	weekStart.setDate(weekStart.getDate() - weekStart.getDay() + weekOffset * 7);
	weekStart.setHours(0, 0, 0, 0);

	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 7);

	const allShifts = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes,
			userName: users.name,
			locationId: shifts.locationId,
			locationName: locations.name
		})
		.from(shifts)
		.leftJoin(users, eq(shifts.userId, users.id))
		.leftJoin(locations, eq(shifts.locationId, locations.id))
		.where(and(gte(shifts.startTime, weekStart), lte(shifts.startTime, weekEnd)))
		.orderBy(shifts.startTime);

	const allUsers = await db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	const allLocations = await db
		.select({ id: locations.id, name: locations.name })
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	return {
		shifts: allShifts,
		users: allUsers,
		locations: allLocations,
		weekStart: weekStart.toISOString(),
		weekOffset
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId')?.toString();
		const locationId = formData.get('locationId')?.toString() || null;
		const startTime = formData.get('startTime')?.toString();
		const endTime = formData.get('endTime')?.toString();
		const notes = formData.get('notes')?.toString() || null;

		if (!userId || !startTime || !endTime) {
			return fail(400, { error: 'User, start time, and end time are required' });
		}

		await db.insert(shifts).values({
			userId,
			locationId,
			startTime: parsePacificDatetime(startTime),
			endTime: parsePacificDatetime(endTime),
			notes,
			createdBy: locals.user.id
		});

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const shiftId = formData.get('shiftId')?.toString();

		if (!shiftId) {
			return fail(400, { error: 'Shift ID required' });
		}

		await db.delete(shifts).where(eq(shifts.id, shiftId));

		return { success: true };
	}
};
