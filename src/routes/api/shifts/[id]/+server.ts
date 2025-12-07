import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, shifts, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// Get single shift
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [shift] = await db.query.shifts.findMany({
		where: eq(shifts.id, params.id),
		with: {
			user: { columns: { id: true, name: true, email: true } },
			location: true
		}
	});

	if (!shift) {
		return json({ error: 'Shift not found' }, { status: 404 });
	}

	// Check access
	if (locals.user.role !== 'manager' && shift.userId !== locals.user.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	return json({ shift });
};

// Update shift (manager only)
export const PUT: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingShift] = await db
		.select()
		.from(shifts)
		.where(eq(shifts.id, params.id))
		.limit(1);

	if (!existingShift) {
		return json({ error: 'Shift not found' }, { status: 404 });
	}

	const body = await request.json();
	const updateData: Record<string, unknown> = { updatedAt: new Date() };

	if (body.userId !== undefined) updateData.userId = body.userId;
	if (body.locationId !== undefined) updateData.locationId = body.locationId;
	if (body.startTime !== undefined) updateData.startTime = new Date(body.startTime);
	if (body.endTime !== undefined) updateData.endTime = new Date(body.endTime);
	if (body.notes !== undefined) updateData.notes = body.notes;

	const [updatedShift] = await db
		.update(shifts)
		.set(updateData)
		.where(eq(shifts.id, params.id))
		.returning();

	// Get full shift with relations
	const [fullShift] = await db.query.shifts.findMany({
		where: eq(shifts.id, params.id),
		with: {
			user: { columns: { id: true, name: true, email: true } },
			location: true
		}
	});

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'update',
		entityType: 'shift',
		entityId: params.id,
		beforeData: { startTime: existingShift.startTime, endTime: existingShift.endTime },
		afterData: { startTime: updatedShift.startTime, endTime: updatedShift.endTime },
		ipAddress: getClientAddress()
	});

	return json({ shift: fullShift });
};

// Delete shift (manager only)
export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingShift] = await db
		.select()
		.from(shifts)
		.where(eq(shifts.id, params.id))
		.limit(1);

	if (!existingShift) {
		return json({ error: 'Shift not found' }, { status: 404 });
	}

	await db.delete(shifts).where(eq(shifts.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'delete',
		entityType: 'shift',
		entityId: params.id,
		beforeData: { startTime: existingShift.startTime, endTime: existingShift.endTime },
		ipAddress: getClientAddress()
	});

	return json({ success: true });
};
