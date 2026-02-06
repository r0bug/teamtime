import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, shiftRequests, shiftRequestResponses, users, locations } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';

// GET - List shift requests
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const status = url.searchParams.get('status') || 'open';

	const requests = await db
		.select({
			id: shiftRequests.id,
			title: shiftRequests.title,
			description: shiftRequests.description,
			requestedDate: shiftRequests.requestedDate,
			startTime: shiftRequests.startTime,
			endTime: shiftRequests.endTime,
			status: shiftRequests.status,
			createdAt: shiftRequests.createdAt,
			locationName: locations.name,
			createdByName: users.name
		})
		.from(shiftRequests)
		.leftJoin(locations, eq(shiftRequests.locationId, locations.id))
		.leftJoin(users, eq(shiftRequests.createdBy, users.id))
		.where(eq(shiftRequests.status, status as 'open' | 'filled' | 'cancelled'))
		.orderBy(desc(shiftRequests.createdAt))
		.limit(50);

	return json(requests);
};

// POST - Create a shift request (managers only)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not authenticated');
	if (locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		throw error(403, 'Only managers can create shift requests');
	}

	const body = await request.json();
	const { title, description, requestedDate, startTime, endTime, locationId, shiftId } = body;

	if (!title || !requestedDate || !startTime || !endTime) {
		throw error(400, 'Missing required fields: title, requestedDate, startTime, endTime');
	}

	const [created] = await db
		.insert(shiftRequests)
		.values({
			title,
			description,
			requestedDate,
			startTime: new Date(startTime),
			endTime: new Date(endTime),
			locationId: locationId || null,
			shiftId: shiftId || null,
			createdBy: locals.user.id
		})
		.returning();

	return json(created, { status: 201 });
};
