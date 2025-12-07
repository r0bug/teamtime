import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, locations, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// Get single location
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, params.id))
		.limit(1);

	if (!location) {
		return json({ error: 'Location not found' }, { status: 404 });
	}

	return json({ location });
};

// Update location (manager only)
export const PUT: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingLocation] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, params.id))
		.limit(1);

	if (!existingLocation) {
		return json({ error: 'Location not found' }, { status: 404 });
	}

	const body = await request.json();
	const updateData: Record<string, unknown> = { updatedAt: new Date() };

	if (body.name !== undefined) updateData.name = body.name;
	if (body.address !== undefined) updateData.address = body.address;
	if (body.lat !== undefined) updateData.lat = body.lat;
	if (body.lng !== undefined) updateData.lng = body.lng;
	if (body.isActive !== undefined) updateData.isActive = body.isActive;

	const [updatedLocation] = await db
		.update(locations)
		.set(updateData)
		.where(eq(locations.id, params.id))
		.returning();

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'update',
		entityType: 'location',
		entityId: params.id,
		beforeData: { name: existingLocation.name, address: existingLocation.address },
		afterData: { name: updatedLocation.name, address: updatedLocation.address },
		ipAddress: getClientAddress()
	});

	return json({ location: updatedLocation });
};

// Delete location (manager only, soft delete)
export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingLocation] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, params.id))
		.limit(1);

	if (!existingLocation) {
		return json({ error: 'Location not found' }, { status: 404 });
	}

	await db
		.update(locations)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(locations.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'delete',
		entityType: 'location',
		entityId: params.id,
		beforeData: { isActive: true },
		afterData: { isActive: false },
		ipAddress: getClientAddress()
	});

	return json({ success: true });
};
