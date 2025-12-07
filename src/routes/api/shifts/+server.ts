import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, shifts, users, locations, auditLogs } from '$lib/server/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

// Get shifts
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const startDate = url.searchParams.get('start');
	const endDate = url.searchParams.get('end');
	const userId = url.searchParams.get('userId');

	const conditions = [];

	// Non-managers can only see their own shifts
	if (locals.user.role !== 'manager') {
		conditions.push(eq(shifts.userId, locals.user.id));
	} else if (userId) {
		conditions.push(eq(shifts.userId, userId));
	}

	if (startDate) {
		conditions.push(gte(shifts.startTime, new Date(startDate)));
	}

	if (endDate) {
		conditions.push(lte(shifts.endTime, new Date(endDate)));
	}

	const shiftList = await db.query.shifts.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(shifts.startTime)],
		with: {
			user: {
				columns: { id: true, name: true, email: true }
			},
			location: true
		}
	});

	return json({ shifts: shiftList });
};

// Create shift (manager only)
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { userId, locationId, startTime, endTime, notes } = body;

	if (!userId || !startTime || !endTime) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (new Date(startTime) >= new Date(endTime)) {
		return json({ error: 'Start time must be before end time' }, { status: 400 });
	}

	// Verify user exists
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	const [newShift] = await db
		.insert(shifts)
		.values({
			userId,
			locationId: locationId || null,
			startTime: new Date(startTime),
			endTime: new Date(endTime),
			notes: notes || null,
			createdBy: locals.user.id
		})
		.returning();

	// Get full shift with relations
	const [fullShift] = await db.query.shifts.findMany({
		where: eq(shifts.id, newShift.id),
		with: {
			user: { columns: { id: true, name: true, email: true } },
			location: true
		}
	});

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'create',
		entityType: 'shift',
		entityId: newShift.id,
		afterData: { userId, startTime, endTime },
		ipAddress: getClientAddress()
	});

	return json({ shift: fullShift }, { status: 201 });
};
