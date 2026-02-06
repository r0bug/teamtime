// AI Token Usage Dashboard - Phase 0.8
import { db, aiTokenUsage, aiActions } from '$lib/server/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Daily cost by agent
	const dailyCosts = await db
		.select({
			agent: aiTokenUsage.agent,
			totalCost: sql<number>`COALESCE(SUM(${aiTokenUsage.costCents}), 0)`,
			totalRuns: sql<number>`count(*)`,
			skippedRuns: sql<number>`SUM(CASE WHEN ${aiTokenUsage.wasSkipped} THEN 1 ELSE 0 END)`,
			totalActions: sql<number>`COALESCE(SUM(${aiTokenUsage.actionsTaken}), 0)`
		})
		.from(aiTokenUsage)
		.where(gte(aiTokenUsage.createdAt, oneDayAgo))
		.groupBy(aiTokenUsage.agent);

	// Weekly cost by agent
	const weeklyCosts = await db
		.select({
			agent: aiTokenUsage.agent,
			totalCost: sql<number>`COALESCE(SUM(${aiTokenUsage.costCents}), 0)`,
			totalRuns: sql<number>`count(*)`,
			skippedRuns: sql<number>`SUM(CASE WHEN ${aiTokenUsage.wasSkipped} THEN 1 ELSE 0 END)`,
			totalActions: sql<number>`COALESCE(SUM(${aiTokenUsage.actionsTaken}), 0)`
		})
		.from(aiTokenUsage)
		.where(gte(aiTokenUsage.createdAt, oneWeekAgo))
		.groupBy(aiTokenUsage.agent);

	// Monthly cost by agent
	const monthlyCosts = await db
		.select({
			agent: aiTokenUsage.agent,
			totalCost: sql<number>`COALESCE(SUM(${aiTokenUsage.costCents}), 0)`,
			totalRuns: sql<number>`count(*)`,
			skippedRuns: sql<number>`SUM(CASE WHEN ${aiTokenUsage.wasSkipped} THEN 1 ELSE 0 END)`,
			totalActions: sql<number>`COALESCE(SUM(${aiTokenUsage.actionsTaken}), 0)`
		})
		.from(aiTokenUsage)
		.where(gte(aiTokenUsage.createdAt, oneMonthAgo))
		.groupBy(aiTokenUsage.agent);

	// Recent runs (last 20)
	const recentRuns = await db
		.select()
		.from(aiTokenUsage)
		.orderBy(desc(aiTokenUsage.createdAt))
		.limit(20);

	// Top token-consuming actions from aiActions (last 7 days)
	const topToolCosts = await db
		.select({
			toolName: aiActions.toolName,
			totalCost: sql<number>`COALESCE(SUM(${aiActions.costCents}), 0)`,
			usageCount: sql<number>`count(*)`
		})
		.from(aiActions)
		.where(and(
			gte(aiActions.createdAt, oneWeekAgo),
			sql`${aiActions.toolName} IS NOT NULL`
		))
		.groupBy(aiActions.toolName)
		.orderBy(sql`SUM(${aiActions.costCents}) DESC`)
		.limit(10);

	// Empty run percentage (runs with no actions) - last 7 days
	const emptyRunStats = await db
		.select({
			totalRuns: sql<number>`count(*)`,
			emptyRuns: sql<number>`SUM(CASE WHEN ${aiTokenUsage.actionsTaken} = 0 AND NOT ${aiTokenUsage.wasSkipped} THEN 1 ELSE 0 END)`,
			skippedRuns: sql<number>`SUM(CASE WHEN ${aiTokenUsage.wasSkipped} THEN 1 ELSE 0 END)`
		})
		.from(aiTokenUsage)
		.where(gte(aiTokenUsage.createdAt, oneWeekAgo));

	return {
		dailyCosts,
		weeklyCosts,
		monthlyCosts,
		recentRuns: recentRuns.map(r => ({
			...r,
			createdAt: r.createdAt.toISOString()
		})),
		topToolCosts,
		emptyRunStats: emptyRunStats[0] || { totalRuns: 0, emptyRuns: 0, skippedRuns: 0 }
	};
};
