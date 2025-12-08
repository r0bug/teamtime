// Tasks Context Provider - Task status, overdue items, and completion rates
import { db, users, tasks, taskCompletions } from '$lib/server/db';
import { eq, and, gte, lte, lt, isNotNull, desc, sql } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';

interface TasksData {
	overdue: {
		taskId: string;
		title: string;
		assignedTo: string;
		assigneeName: string;
		dueAt: Date;
		hoursOverdue: number;
		priority: string;
	}[];
	dueSoon: {
		taskId: string;
		title: string;
		assignedTo: string;
		assigneeName: string;
		dueAt: Date;
		hoursUntilDue: number;
	}[];
	recentlyCompleted: {
		taskId: string;
		title: string;
		completedBy: string;
		completedByName: string;
		completedAt: Date;
	}[];
	unassigned: {
		taskId: string;
		title: string;
		dueAt?: Date;
	}[];
	summary: {
		totalOverdue: number;
		totalDueSoon: number;
		totalInProgress: number;
		totalUnassigned: number;
		completedToday: number;
	};
}

export const tasksProvider: AIContextProvider<TasksData> = {
	moduleId: 'tasks',
	moduleName: 'Task Management',
	description: 'Overdue tasks, upcoming deadlines, and completion tracking',
	priority: 20,
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<TasksData> {
		const now = new Date();
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		// Get active users
		const activeUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.isActive, true));
		const userMap = new Map(activeUsers.map(u => [u.id, u.name]));

		// Get overdue tasks (past due, not completed)
		const overdueTasks = await db
			.select({
				id: tasks.id,
				title: tasks.title,
				assignedTo: tasks.assignedTo,
				dueAt: tasks.dueAt,
				priority: tasks.priority
			})
			.from(tasks)
			.where(and(
				lt(tasks.dueAt, now),
				eq(tasks.status, 'not_started')
			))
			.orderBy(tasks.dueAt);

		const overdue = overdueTasks.map(t => ({
			taskId: t.id,
			title: t.title,
			assignedTo: t.assignedTo || '',
			assigneeName: t.assignedTo ? (userMap.get(t.assignedTo) || 'Unknown') : 'Unassigned',
			dueAt: new Date(t.dueAt!),
			hoursOverdue: Math.round((now.getTime() - new Date(t.dueAt!).getTime()) / 3600000),
			priority: t.priority
		}));

		// Get tasks due soon (within next 24 hours)
		const dueSoonTasks = await db
			.select({
				id: tasks.id,
				title: tasks.title,
				assignedTo: tasks.assignedTo,
				dueAt: tasks.dueAt
			})
			.from(tasks)
			.where(and(
				gte(tasks.dueAt, now),
				lte(tasks.dueAt, tomorrow),
				eq(tasks.status, 'not_started')
			))
			.orderBy(tasks.dueAt);

		const dueSoon = dueSoonTasks.map(t => ({
			taskId: t.id,
			title: t.title,
			assignedTo: t.assignedTo || '',
			assigneeName: t.assignedTo ? (userMap.get(t.assignedTo) || 'Unknown') : 'Unassigned',
			dueAt: new Date(t.dueAt!),
			hoursUntilDue: Math.round((new Date(t.dueAt!).getTime() - now.getTime()) / 3600000)
		}));

		// Get recently completed (today)
		const completedToday = await db
			.select({
				id: taskCompletions.id,
				taskId: taskCompletions.taskId,
				completedBy: taskCompletions.completedBy,
				completedAt: taskCompletions.completedAt,
				title: tasks.title
			})
			.from(taskCompletions)
			.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(gte(taskCompletions.completedAt, todayStart))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(10);

		const recentlyCompleted = completedToday.map(c => ({
			taskId: c.taskId,
			title: c.title,
			completedBy: c.completedBy,
			completedByName: userMap.get(c.completedBy) || 'Unknown',
			completedAt: new Date(c.completedAt)
		}));

		// Get unassigned tasks
		const unassignedTasks = await db
			.select({
				id: tasks.id,
				title: tasks.title,
				dueAt: tasks.dueAt
			})
			.from(tasks)
			.where(and(
				sql`${tasks.assignedTo} IS NULL`,
				eq(tasks.status, 'not_started')
			))
			.limit(10);

		const unassigned = unassignedTasks.map(t => ({
			taskId: t.id,
			title: t.title,
			dueAt: t.dueAt ? new Date(t.dueAt) : undefined
		}));

		// Get in-progress count
		const inProgressCount = await db
			.select({ count: sql<number>`count(*)` })
			.from(tasks)
			.where(eq(tasks.status, 'in_progress'));

		return {
			overdue,
			dueSoon,
			recentlyCompleted,
			unassigned,
			summary: {
				totalOverdue: overdue.length,
				totalDueSoon: dueSoon.length,
				totalInProgress: Number(inProgressCount[0]?.count || 0),
				totalUnassigned: unassigned.length,
				completedToday: recentlyCompleted.length
			}
		};
	},

	estimateTokens(context: TasksData): number {
		return 80 +
			context.overdue.length * 40 +
			context.dueSoon.length * 30 +
			context.recentlyCompleted.length * 25 +
			context.unassigned.length * 20;
	},

	formatForPrompt(context: TasksData): string {
		const lines: string[] = [
			'## Tasks',
			`Summary: ${context.summary.totalOverdue} overdue, ${context.summary.totalDueSoon} due soon, ${context.summary.completedToday} completed today`,
			''
		];

		if (context.overdue.length > 0) {
			lines.push('### Overdue Tasks:');
			for (const t of context.overdue) {
				lines.push(`- [${t.priority.toUpperCase()}] "${t.title}" - ${t.assigneeName} (${t.hoursOverdue}h overdue)`);
			}
			lines.push('');
		}

		if (context.dueSoon.length > 0) {
			lines.push('### Due Soon (next 24h):');
			for (const t of context.dueSoon) {
				lines.push(`- "${t.title}" - ${t.assigneeName} (${t.hoursUntilDue}h remaining)`);
			}
			lines.push('');
		}

		if (context.unassigned.length > 0) {
			lines.push('### Unassigned Tasks:');
			for (const t of context.unassigned) {
				const due = t.dueAt ? ` (due ${t.dueAt.toLocaleDateString()})` : '';
				lines.push(`- "${t.title}"${due}`);
			}
			lines.push('');
		}

		if (context.recentlyCompleted.length > 0) {
			lines.push('### Completed Today:');
			for (const c of context.recentlyCompleted) {
				lines.push(`- "${c.title}" by ${c.completedByName} at ${c.completedAt.toLocaleTimeString()}`);
			}
		}

		return lines.join('\n');
	}
};
