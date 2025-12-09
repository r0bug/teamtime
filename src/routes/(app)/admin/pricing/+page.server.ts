import type { PageServerLoad } from './$types';
import { db, pricingDecisions, users } from '$lib/server/db';
import { eq, desc, sql, count, sum, and, gte, lte } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Date range filter (default to last 30 days)
	const endDate = url.searchParams.get('endDate')
		? new Date(url.searchParams.get('endDate')!)
		: new Date();
	const startDate = url.searchParams.get('startDate')
		? new Date(url.searchParams.get('startDate')!)
		: new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Build date filter conditions
	const dateConditions = and(
		gte(pricingDecisions.pricedAt, startDate),
		lte(pricingDecisions.pricedAt, endDate)
	);

	// Overall stats
	const [overallStats] = await db
		.select({
			totalDecisions: count(),
			totalValue: sum(pricingDecisions.price)
		})
		.from(pricingDecisions)
		.where(dateConditions);

	// Stats by destination
	const destinationStats = await db
		.select({
			destination: pricingDecisions.destination,
			count: count(),
			totalValue: sum(pricingDecisions.price)
		})
		.from(pricingDecisions)
		.where(dateConditions)
		.groupBy(pricingDecisions.destination);

	// Stats by user
	const userStats = await db
		.select({
			userId: pricingDecisions.userId,
			userName: users.name,
			count: count(),
			totalValue: sum(pricingDecisions.price)
		})
		.from(pricingDecisions)
		.leftJoin(users, eq(pricingDecisions.userId, users.id))
		.where(dateConditions)
		.groupBy(pricingDecisions.userId, users.name)
		.orderBy(desc(count()));

	// Recent decisions
	const recentDecisions = await db
		.select({
			id: pricingDecisions.id,
			userName: users.name,
			itemDescription: pricingDecisions.itemDescription,
			price: pricingDecisions.price,
			destination: pricingDecisions.destination,
			pricedAt: pricingDecisions.pricedAt
		})
		.from(pricingDecisions)
		.leftJoin(users, eq(pricingDecisions.userId, users.id))
		.where(dateConditions)
		.orderBy(desc(pricingDecisions.pricedAt))
		.limit(20);

	return {
		stats: {
			total: {
				count: overallStats?.totalDecisions || 0,
				value: overallStats?.totalValue || '0'
			},
			byDestination: destinationStats.map(d => ({
				destination: d.destination,
				count: d.count,
				value: d.totalValue || '0'
			})),
			byUser: userStats.map(u => ({
				userId: u.userId,
				userName: u.userName || 'Unknown',
				count: u.count,
				value: u.totalValue || '0'
			}))
		},
		recentDecisions,
		dateRange: {
			startDate: startDate.toISOString().split('T')[0],
			endDate: endDate.toISOString().split('T')[0]
		}
	};
};
