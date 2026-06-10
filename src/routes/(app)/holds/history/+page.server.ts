import type { PageServerLoad } from './$types';
import { db, customerHolds, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const clearedBy = alias(users, 'cleared_by_user');

export const load: PageServerLoad = async () => {
	const holds = await db
		.select({
			id: customerHolds.id,
			reason: customerHolds.reason,
			missingPrice: customerHolds.missingPrice,
			customerName: customerHolds.customerName,
			itemDescription: customerHolds.itemDescription,
			pickupDate: customerHolds.pickupDate,
			photoPath: customerHolds.photoPath,
			clearedReason: customerHolds.clearedReason,
			clearedAt: customerHolds.clearedAt,
			createdAt: customerHolds.createdAt,
			createdByName: users.name,
			clearedByName: clearedBy.name
		})
		.from(customerHolds)
		.leftJoin(users, eq(customerHolds.createdByUserId, users.id))
		.leftJoin(clearedBy, eq(customerHolds.clearedByUserId, clearedBy.id))
		.where(eq(customerHolds.status, 'cleared'))
		.orderBy(desc(customerHolds.clearedAt))
		.limit(200);

	return { holds };
};
