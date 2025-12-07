import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { hashPin, validatePinFormat } from '$lib/server/auth/pin';

// Get single user
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Users can view themselves, managers can view anyone
	if (locals.user.id !== params.id && locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [user] = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt,
			updatedAt: users.updatedAt
		})
		.from(users)
		.where(eq(users.id, params.id))
		.limit(1);

	if (!user) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	return json({ user });
};

// Update user
export const PUT: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Users can update themselves (limited), managers can update anyone
	const isSelf = locals.user.id === params.id;
	const isManager = locals.user.role === 'manager';

	if (!isSelf && !isManager) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingUser] = await db
		.select()
		.from(users)
		.where(eq(users.id, params.id))
		.limit(1);

	if (!existingUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	const body = await request.json();
	const updateData: Record<string, unknown> = { updatedAt: new Date() };

	// Fields users can update for themselves
	if (body.name !== undefined) updateData.name = body.name;
	if (body.phone !== undefined) updateData.phone = body.phone;

	// Fields only managers can update
	if (isManager) {
		if (body.email !== undefined) updateData.email = body.email.toLowerCase();
		if (body.username !== undefined) updateData.username = body.username.toLowerCase();
		if (body.role !== undefined) updateData.role = body.role;
		if (body.isActive !== undefined) updateData.isActive = body.isActive;
	}

	// PIN change (requires special handling)
	if (body.pin !== undefined) {
		if (!validatePinFormat(body.pin)) {
			return json({ error: 'PIN must be 4-8 digits' }, { status: 400 });
		}
		updateData.pinHash = await hashPin(body.pin);
	}

	const [updatedUser] = await db
		.update(users)
		.set(updateData)
		.where(eq(users.id, params.id))
		.returning({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			updatedAt: users.updatedAt
		});

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'update',
		entityType: 'user',
		entityId: params.id,
		beforeData: { name: existingUser.name, role: existingUser.role, isActive: existingUser.isActive },
		afterData: { name: updatedUser.name, role: updatedUser.role, isActive: updatedUser.isActive },
		ipAddress: getClientAddress()
	});

	return json({ user: updatedUser });
};

// Delete user (manager only, soft delete)
export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	if (locals.user.id === params.id) {
		return json({ error: 'Cannot delete yourself' }, { status: 400 });
	}

	const [existingUser] = await db
		.select()
		.from(users)
		.where(eq(users.id, params.id))
		.limit(1);

	if (!existingUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	// Soft delete by deactivating
	await db
		.update(users)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(users.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'delete',
		entityType: 'user',
		entityId: params.id,
		beforeData: { isActive: true },
		afterData: { isActive: false },
		ipAddress: getClientAddress()
	});

	return json({ success: true });
};
