import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users, auditLogs } from '$lib/server/db';
import { eq, ilike, or, desc } from 'drizzle-orm';
import { hashPin, validatePinFormat } from '$lib/server/auth/pin';
import { requirePermission } from '$lib/server/auth/require-permission';
import { sanitizeName, sanitizeEmail } from '$lib/server/utils/sanitize';

// Get all users (manager only, or users with view_users permission)
export const GET: RequestHandler = async (event) => {
	const permError = requirePermission(event, 'view_users');
	if (permError) return permError;

	const { locals, url } = event;

	const search = url.searchParams.get('search') || '';
	const role = url.searchParams.get('role');
	const activeOnly = url.searchParams.get('active') !== 'false';

	let query = db.select({
		id: users.id,
		email: users.email,
		username: users.username,
		name: users.name,
		phone: users.phone,
		role: users.role,
		isActive: users.isActive,
		createdAt: users.createdAt
	}).from(users).$dynamic();

	const conditions = [];

	if (search) {
		conditions.push(
			or(
				ilike(users.name, `%${search}%`),
				ilike(users.email, `%${search}%`),
				ilike(users.username, `%${search}%`)
			)
		);
	}

	if (role) {
		conditions.push(eq(users.role, role as 'manager' | 'purchaser' | 'staff'));
	}

	if (activeOnly) {
		conditions.push(eq(users.isActive, true));
	}

	const userList = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(desc(users.createdAt));

	return json({ users: userList });
};

// Create new user (manager only, or users with create_user permission)
export const POST: RequestHandler = async (event) => {
	const permError = requirePermission(event, 'create_user');
	if (permError) return permError;

	const { locals, request, getClientAddress } = event;
	const body = await request.json();
	const { email, username, name, phone, role, pin } = body;

	// Validation
	if (!email || !username || !name || !pin) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (!validatePinFormat(pin)) {
		return json({ error: 'PIN must be 4-8 digits' }, { status: 400 });
	}

	// Check for existing email or username
	const [existing] = await db
		.select()
		.from(users)
		.where(or(eq(users.email, email.toLowerCase()), eq(users.username, username.toLowerCase())))
		.limit(1);

	if (existing) {
		return json({ error: 'Email or username already exists' }, { status: 400 });
	}

	// Sanitize input
	const sanitizedEmail = sanitizeEmail(email);
	const sanitizedName = sanitizeName(name);
	const sanitizedUsername = username.toLowerCase().trim().slice(0, 50);
	const sanitizedPhone = phone ? phone.replace(/[^0-9+\-\s()]/g, '').slice(0, 20) : null;

	// Create user
	const pinHash = await hashPin(pin);
	const [newUser] = await db
		.insert(users)
		.values({
			email: sanitizedEmail,
			username: sanitizedUsername,
			name: sanitizedName,
			phone: sanitizedPhone,
			role: role || 'staff',
			pinHash,
			isActive: true
		})
		.returning({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt
		});

	// Audit log (user is guaranteed non-null by requirePermission check)
	await db.insert(auditLogs).values({
		userId: locals.user!.id,
		action: 'create',
		entityType: 'user',
		entityId: newUser.id,
		afterData: { email: newUser.email, name: newUser.name, role: newUser.role },
		ipAddress: getClientAddress()
	});

	return json({ user: newUser }, { status: 201 });
};
