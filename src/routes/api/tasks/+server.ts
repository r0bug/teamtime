import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks, users, notifications, auditLogs } from '$lib/server/db';
import { eq, and, or, desc, isNull } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { sanitizeTitle, sanitizeDescription } from '$lib/server/utils/sanitize';
import { requireAuth, requirePermission } from '$lib/server/auth/require-permission';

// Get tasks
export const GET: RequestHandler = async (event) => {
	const authError = requireAuth(event);
	if (authError) return authError;

	const { locals, url } = event;

	const status = url.searchParams.get('status');
	const assignedTo = url.searchParams.get('assignedTo');
	const priority = url.searchParams.get('priority');

	const conditions = [];

	// User is guaranteed non-null by requireAuth check
	const user = locals.user!;

	// Admins and managers can see all tasks, others only see their own
	if (!isManager(user)) {
		conditions.push(eq(tasks.assignedTo, user.id));
	} else if (assignedTo) {
		conditions.push(eq(tasks.assignedTo, assignedTo));
	}

	if (status) {
		conditions.push(eq(tasks.status, status as 'not_started' | 'in_progress' | 'completed' | 'cancelled'));
	}

	if (priority) {
		conditions.push(eq(tasks.priority, priority as 'low' | 'medium' | 'high' | 'urgent'));
	}

	const taskList = await db.query.tasks.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(tasks.createdAt)],
		with: {
			assignee: { columns: { id: true, name: true } },
			template: { columns: { id: true, name: true } },
			completions: true,
			photos: true
		}
	});

	return json({ tasks: taskList });
};

// Create task (admin/manager only, or users with create_task permission)
export const POST: RequestHandler = async (event) => {
	// Check permission to create tasks
	const permError = requirePermission(event, 'create_task');
	if (permError) return permError;

	const { locals, request, getClientAddress } = event;
	// User is guaranteed non-null by requirePermission check
	const user = locals.user!;

	const body = await request.json();
	const { title, description, assignedTo, priority, dueAt, photoRequired, notesRequired, templateId } = body;

	if (!title) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	// Sanitize user input to prevent XSS
	const sanitizedTitle = sanitizeTitle(title);
	const sanitizedDescription = description ? sanitizeDescription(description) : null;

	const [newTask] = await db
		.insert(tasks)
		.values({
			title: sanitizedTitle,
			description: sanitizedDescription,
			assignedTo: assignedTo || null,
			priority: priority || 'medium',
			dueAt: dueAt ? new Date(dueAt) : null,
			status: 'not_started',
			photoRequired: photoRequired || false,
			notesRequired: notesRequired || false,
			source: 'manual',
			templateId: templateId || null,
			createdBy: user.id
		})
		.returning();

	// Send notification to assignee
	if (assignedTo) {
		await db.insert(notifications).values({
			userId: assignedTo,
			type: 'task_assigned',
			title: 'New Task Assigned',
			body: `You have been assigned: ${sanitizedTitle}`,
			data: { taskId: newTask.id }
		});
	}

	// Get full task with relations
	const [fullTask] = await db.query.tasks.findMany({
		where: eq(tasks.id, newTask.id),
		with: {
			assignee: { columns: { id: true, name: true } },
			template: { columns: { id: true, name: true } }
		}
	});

	// Audit log
	await db.insert(auditLogs).values({
		userId: user.id,
		action: 'create',
		entityType: 'task',
		entityId: newTask.id,
		afterData: { title: sanitizedTitle, assignedTo, priority },
		ipAddress: getClientAddress()
	});

	return json({ task: fullTask }, { status: 201 });
};
