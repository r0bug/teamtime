import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, locations, auditLogs } from '$lib/server/db';
import { eq, ilike, desc } from 'drizzle-orm';

// Get all locations
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const search = url.searchParams.get('search') || '';
	const activeOnly = url.searchParams.get('active') !== 'false';

	let query = db.select().from(locations).$dynamic();

	if (activeOnly) {
		query = query.where(eq(locations.isActive, true));
	}

	const locationList = await query.orderBy(desc(locations.createdAt));

	return json({ locations: locationList });
};

// Create new location (manager only)
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { name, address, lat, lng } = body;

	if (!name) {
		return json({ error: 'Name is required' }, { status: 400 });
	}

	const [newLocation] = await db
		.insert(locations)
		.values({
			name,
			address: address || null,
			lat: lat || null,
			lng: lng || null,
			isActive: true
		})
		.returning();

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'create',
		entityType: 'location',
		entityId: newLocation.id,
		afterData: { name: newLocation.name, address: newLocation.address },
		ipAddress: getClientAddress()
	});

	return json({ location: newLocation }, { status: 201 });
};
