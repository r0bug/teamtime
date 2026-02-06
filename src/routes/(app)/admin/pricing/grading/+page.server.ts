import type { PageServerLoad } from './$types';
import { db, pricingDecisions, pricingGrades, pricingDecisionPhotos, users } from '$lib/server/db';
import { eq, isNull, desc, sql } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
		throw redirect(302, '/dashboard');
	}

	const showAll = url.searchParams.get('all') === 'true';

	// Get ungraded pricing decisions (or all if showAll)
	const baseQuery = db
		.select({
			id: pricingDecisions.id,
			userId: pricingDecisions.userId,
			userName: users.name,
			itemDescription: pricingDecisions.itemDescription,
			price: pricingDecisions.price,
			priceJustification: pricingDecisions.priceJustification,
			destination: pricingDecisions.destination,
			pricedAt: pricingDecisions.pricedAt,
			hasGrade: sql<boolean>`${pricingGrades.id} IS NOT NULL`.as('has_grade')
		})
		.from(pricingDecisions)
		.leftJoin(users, eq(pricingDecisions.userId, users.id))
		.leftJoin(pricingGrades, eq(pricingDecisions.id, pricingGrades.pricingDecisionId));

	const ungradedPricing = showAll
		? await baseQuery.orderBy(desc(pricingDecisions.pricedAt)).limit(100)
		: await baseQuery
				.where(isNull(pricingGrades.id))
				.orderBy(desc(pricingDecisions.pricedAt))
				.limit(100);

	// Get stats
	const [stats] = await db
		.select({
			total: sql<number>`count(DISTINCT ${pricingDecisions.id})::int`,
			graded: sql<number>`count(DISTINCT ${pricingGrades.pricingDecisionId})::int`
		})
		.from(pricingDecisions)
		.leftJoin(pricingGrades, eq(pricingDecisions.id, pricingGrades.pricingDecisionId));

	const ungraded = (stats?.total || 0) - (stats?.graded || 0);

	// Get photo counts for each decision
	const photoCountsRaw = await db
		.select({
			pricingDecisionId: pricingDecisionPhotos.pricingDecisionId,
			count: sql<number>`count(*)::int`
		})
		.from(pricingDecisionPhotos)
		.where(
			sql`${pricingDecisionPhotos.pricingDecisionId} IN (${sql.join(
				ungradedPricing.map((p) => sql`${p.id}`),
				sql`, `
			)})`
		)
		.groupBy(pricingDecisionPhotos.pricingDecisionId);

	const photoCounts: Record<string, number> = {};
	for (const row of photoCountsRaw) {
		photoCounts[row.pricingDecisionId] = row.count;
	}

	return {
		ungradedPricing: ungradedPricing.map((p) => ({
			...p,
			photoCount: photoCounts[p.id] || 0
		})),
		stats: {
			total: stats?.total || 0,
			graded: stats?.graded || 0,
			ungraded
		},
		showAll
	};
};
