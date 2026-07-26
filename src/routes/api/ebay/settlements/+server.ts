import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { db, ebaySaleSettlements, users, consignors } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, url }) => {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });

	const period = url.searchParams.get('period') ?? undefined;
	const status = url.searchParams.get('status') ?? undefined;
	const conditions = [];
	if (period) conditions.push(eq(ebaySaleSettlements.payPeriod, period));
	if (status === 'pending' || status === 'approved' || status === 'exported') {
		conditions.push(eq(ebaySaleSettlements.status, status));
	}

	const rows = await db
		.select({
			s: ebaySaleSettlements,
			listerName: users.name,
			consignorName: consignors.name
		})
		.from(ebaySaleSettlements)
		.leftJoin(users, eq(ebaySaleSettlements.listerUserId, users.id))
		.leftJoin(consignors, eq(ebaySaleSettlements.consignorId, consignors.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(ebaySaleSettlements.soldAt))
		.limit(500);

	return json({
		settlements: rows.map(({ s, listerName, consignorName }) => ({ ...s, listerName, consignorName }))
	});
};
