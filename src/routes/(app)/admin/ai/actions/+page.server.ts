import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, aiActions, users } from '$lib/server/db';
import { desc, eq, and, gte, lte, sql, count } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Parse query params
	const agent = url.searchParams.get('agent') || 'all';
	const status = url.searchParams.get('status') || 'all';
	const days = parseInt(url.searchParams.get('days') || '7', 10);
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = 50;
	const offset = (page - 1) * limit;

	// Calculate date range
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	// Build filter conditions
	const conditions = [gte(aiActions.createdAt, startDate)];

	if (agent !== 'all') {
		conditions.push(eq(aiActions.agent, agent as 'office_manager' | 'revenue_optimizer'));
	}

	if (status === 'executed') {
		conditions.push(eq(aiActions.executed, true));
	} else if (status === 'blocked') {
		conditions.push(eq(aiActions.executed, false));
		conditions.push(sql`${aiActions.blockedReason} IS NOT NULL`);
	} else if (status === 'error') {
		conditions.push(sql`${aiActions.error} IS NOT NULL`);
	} else if (status === 'observation') {
		conditions.push(sql`${aiActions.toolName} IS NULL`);
	}

	// Get actions with user info
	const actions = await db
		.select({
			id: aiActions.id,
			agent: aiActions.agent,
			runId: aiActions.runId,
			runStartedAt: aiActions.runStartedAt,
			contextSnapshot: aiActions.contextSnapshot,
			contextTokens: aiActions.contextTokens,
			reasoning: aiActions.reasoning,
			toolName: aiActions.toolName,
			toolParams: aiActions.toolParams,
			executed: aiActions.executed,
			executionResult: aiActions.executionResult,
			blockedReason: aiActions.blockedReason,
			error: aiActions.error,
			targetUserId: aiActions.targetUserId,
			tokensUsed: aiActions.tokensUsed,
			costCents: aiActions.costCents,
			createdAt: aiActions.createdAt,
			targetUserName: users.name
		})
		.from(aiActions)
		.leftJoin(users, eq(aiActions.targetUserId, users.id))
		.where(and(...conditions))
		.orderBy(desc(aiActions.createdAt))
		.limit(limit)
		.offset(offset);

	// Get total count for pagination
	const [countResult] = await db
		.select({ count: count() })
		.from(aiActions)
		.where(and(...conditions));

	const totalCount = countResult?.count || 0;
	const totalPages = Math.ceil(totalCount / limit);

	// Get summary stats for the period
	const allActionsInPeriod = await db
		.select({
			agent: aiActions.agent,
			executed: aiActions.executed,
			toolName: aiActions.toolName,
			blockedReason: aiActions.blockedReason,
			error: aiActions.error,
			costCents: aiActions.costCents
		})
		.from(aiActions)
		.where(gte(aiActions.createdAt, startDate));

	const stats = {
		total: allActionsInPeriod.length,
		executed: allActionsInPeriod.filter(a => a.executed).length,
		blocked: allActionsInPeriod.filter(a => !a.executed && a.blockedReason).length,
		errors: allActionsInPeriod.filter(a => a.error).length,
		observations: allActionsInPeriod.filter(a => !a.toolName).length,
		totalCostCents: allActionsInPeriod.reduce((sum, a) => sum + (a.costCents || 0), 0),
		byAgent: {
			office_manager: allActionsInPeriod.filter(a => a.agent === 'office_manager').length,
			revenue_optimizer: allActionsInPeriod.filter(a => a.agent === 'revenue_optimizer').length
		}
	};

	return {
		actions,
		stats,
		filters: {
			agent,
			status,
			days
		},
		pagination: {
			page,
			limit,
			totalCount,
			totalPages
		}
	};
};
