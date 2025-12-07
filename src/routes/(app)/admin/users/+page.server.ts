import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { desc } from 'drizzle-orm';
import { canManageUsers } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canManageUsers(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allUsers = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			avatarUrl: users.avatarUrl,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(desc(users.createdAt));

	return { users: allUsers };
};
