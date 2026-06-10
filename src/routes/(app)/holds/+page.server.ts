import type { PageServerLoad } from './$types';
import { db, customerHolds, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { urgencyAnchor } from '$lib/server/services/holds-service';

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			id: customerHolds.id,
			reason: customerHolds.reason,
			missingPrice: customerHolds.missingPrice,
			customerName: customerHolds.customerName,
			customerPhone: customerHolds.customerPhone,
			itemDescription: customerHolds.itemDescription,
			pickupDate: customerHolds.pickupDate,
			notes: customerHolds.notes,
			photoPath: customerHolds.photoPath,
			createdAt: customerHolds.createdAt,
			createdByName: users.name
		})
		.from(customerHolds)
		.leftJoin(users, eq(customerHolds.createdByUserId, users.id))
		.where(eq(customerHolds.status, 'active'))
		.orderBy(desc(customerHolds.createdAt))
		.limit(200);

	const holds = rows
		.map((h) => ({ ...h, urgencyAnchor: urgencyAnchor(h).toISOString() }))
		// Most-overdue first (oldest anchor first).
		.sort((a, b) => new Date(a.urgencyAnchor).getTime() - new Date(b.urgencyAnchor).getTime());

	return { holds };
};
