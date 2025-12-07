import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, auditLogs, users } from '$lib/server/db';
import { desc, eq } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 50;
	const offset = (page - 1) * limit;

	const logs = await db
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			entityType: auditLogs.entityType,
			entityId: auditLogs.entityId,
			beforeData: auditLogs.beforeData,
			afterData: auditLogs.afterData,
			ipAddress: auditLogs.ipAddress,
			createdAt: auditLogs.createdAt,
			userId: auditLogs.userId,
			userName: users.name,
			userEmail: users.email
		})
		.from(auditLogs)
		.leftJoin(users, eq(auditLogs.userId, users.id))
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit)
		.offset(offset);

	return { logs, page };
};
