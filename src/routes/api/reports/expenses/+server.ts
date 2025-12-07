import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, atmWithdrawals, withdrawalAllocations, users } from '$lib/server/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const startDate = url.searchParams.get('start');
	const endDate = url.searchParams.get('end');
	const userId = url.searchParams.get('userId');
	const format = url.searchParams.get('format') || 'json';

	const conditions = [];

	if (startDate) {
		conditions.push(gte(atmWithdrawals.withdrawnAt, new Date(startDate)));
	}

	if (endDate) {
		conditions.push(lte(atmWithdrawals.withdrawnAt, new Date(endDate)));
	}

	if (userId) {
		conditions.push(eq(atmWithdrawals.userId, userId));
	}

	const withdrawals = await db.query.atmWithdrawals.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(atmWithdrawals.withdrawnAt)],
		with: {
			user: { columns: { id: true, name: true, email: true } },
			allocations: {
				with: {
					purchaseRequest: { columns: { id: true, description: true } }
				}
			}
		}
	});

	// Summary
	const summary = await db
		.select({
			userId: atmWithdrawals.userId,
			userName: users.name,
			totalWithdrawn: sql<number>`SUM(${atmWithdrawals.amount})::numeric`,
			totalAllocated: sql<number>`
				COALESCE((
					SELECT SUM(wa.amount)::numeric
					FROM withdrawal_allocations wa
					WHERE wa.withdrawal_id = ${atmWithdrawals.id}
				), 0)
			`,
			withdrawalCount: sql<number>`COUNT(*)::int`
		})
		.from(atmWithdrawals)
		.innerJoin(users, eq(users.id, atmWithdrawals.userId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.groupBy(atmWithdrawals.userId, users.name, atmWithdrawals.id);

	if (format === 'csv') {
		const csvHeader = 'Employee,Email,Withdrawn At,Amount,Status,Location,Allocations\n';
		const csvRows = withdrawals.map(w => {
			const allocations = w.allocations.map(a => `${a.productDescription || 'N/A'}: $${a.amount}`).join('; ');
			return `"${w.user.name}","${w.user.email}","${w.withdrawnAt.toISOString()}","${w.amount}","${w.status}","${w.address || ''}","${allocations}"`;
		}).join('\n');

		return new Response(csvHeader + csvRows, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': 'attachment; filename="expense-report.csv"'
			}
		});
	}

	return json({ withdrawals, summary });
};
