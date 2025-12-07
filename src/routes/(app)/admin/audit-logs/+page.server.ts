import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, auditLogs } from '$lib/server/db';
import { eq, desc, sql } from 'drizzle-orm';
import { isAdmin, canViewAuditLogs } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canViewAuditLogs(locals.user)) {
		throw redirect(302, '/admin');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 50;
	const offset = (page - 1) * limit;

	// Get audit logs with user info
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

	// Get total count
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(auditLogs);

	const totalCount = countResult[0]?.count || 0;
	const totalPages = Math.ceil(totalCount / limit);

	return {
		logs,
		page,
		totalPages,
		totalCount
	};
};
