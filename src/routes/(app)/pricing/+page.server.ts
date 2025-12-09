import type { PageServerLoad } from './$types';
import { db, pricingDecisions, pricingDecisionPhotos, users } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const isManager = user.role === 'manager' || user.role === 'admin';

	// Non-managers only see their own decisions
	const whereClause = isManager ? undefined : eq(pricingDecisions.userId, user.id);

	const decisions = await db
		.select({
			id: pricingDecisions.id,
			userId: pricingDecisions.userId,
			userName: users.name,
			itemDescription: pricingDecisions.itemDescription,
			price: pricingDecisions.price,
			destination: pricingDecisions.destination,
			ebayReason: pricingDecisions.ebayReason,
			pricedAt: pricingDecisions.pricedAt
		})
		.from(pricingDecisions)
		.leftJoin(users, eq(pricingDecisions.userId, users.id))
		.where(whereClause)
		.orderBy(desc(pricingDecisions.pricedAt))
		.limit(100);

	// Get first photo for each decision as thumbnail
	const decisionsWithThumbnails = await Promise.all(
		decisions.map(async (decision) => {
			const [photo] = await db
				.select({ filePath: pricingDecisionPhotos.filePath })
				.from(pricingDecisionPhotos)
				.where(eq(pricingDecisionPhotos.pricingDecisionId, decision.id))
				.limit(1);
			return {
				...decision,
				thumbnail: photo?.filePath || null
			};
		})
	);

	return {
		decisions: decisionsWithThumbnails,
		isManager
	};
};
