import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, taskTemplates, taskAssignmentRules, tasks } from '$lib/server/db';
import { sql, eq, and, gte } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const now = new Date();
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);

	const startOfWeek = new Date(now);
	startOfWeek.setDate(now.getDate() - now.getDay());
	startOfWeek.setHours(0, 0, 0, 0);

	// Get template counts
	const templateStats = await db
		.select({
			total: sql<number>`count(*)`,
			active: sql<number>`count(*) filter (where is_active = true)`
		})
		.from(taskTemplates);

	// Get rule counts
	const ruleStats = await db
		.select({
			total: sql<number>`count(*)`,
			active: sql<number>`count(*) filter (where is_active = true)`
		})
		.from(taskAssignmentRules);

	// Get tasks generated today (from rules - event_triggered source)
	const tasksToday = await db
		.select({ count: sql<number>`count(*)` })
		.from(tasks)
		.where(and(
			gte(tasks.createdAt, startOfToday),
			eq(tasks.source, 'event_triggered')
		));

	// Get tasks generated this week
	const tasksThisWeek = await db
		.select({ count: sql<number>`count(*)` })
		.from(tasks)
		.where(and(
			gte(tasks.createdAt, startOfWeek),
			eq(tasks.source, 'event_triggered')
		));

	// Get recently triggered rules
	const recentRules = await db
		.select({
			id: taskAssignmentRules.id,
			name: taskAssignmentRules.name,
			triggerType: taskAssignmentRules.triggerType,
			triggerCount: taskAssignmentRules.triggerCount,
			lastTriggeredAt: taskAssignmentRules.lastTriggeredAt
		})
		.from(taskAssignmentRules)
		.where(eq(taskAssignmentRules.isActive, true))
		.orderBy(sql`${taskAssignmentRules.lastTriggeredAt} DESC NULLS LAST`)
		.limit(5);

	// Get templates with rule counts
	const templatesWithRules = await db
		.select({
			id: taskTemplates.id,
			name: taskTemplates.name,
			isActive: taskTemplates.isActive,
			triggerEvent: taskTemplates.triggerEvent,
			ruleCount: sql<number>`(
				SELECT count(*)
				FROM task_assignment_rules
				WHERE template_id = ${taskTemplates.id}
			)`
		})
		.from(taskTemplates)
		.orderBy(sql`${taskTemplates.updatedAt} DESC`)
		.limit(5);

	return {
		stats: {
			totalTemplates: templateStats[0]?.total || 0,
			activeTemplates: templateStats[0]?.active || 0,
			totalRules: ruleStats[0]?.total || 0,
			activeRules: ruleStats[0]?.active || 0,
			tasksGeneratedToday: tasksToday[0]?.count || 0,
			tasksGeneratedThisWeek: tasksThisWeek[0]?.count || 0
		},
		recentRules,
		templatesWithRules
	};
};
