import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks, notifications, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { parsePacificDatetime } from '$lib/server/utils/timezone';

// Get single task
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [task] = await db.query.tasks.findMany({
		where: eq(tasks.id, params.id),
		with: {
			assignee: { columns: { id: true, name: true, email: true } },
			template: true,
			completions: {
				with: {
					completedByUser: { columns: { id: true, name: true } },
					photos: true
				}
			},
			photos: true
		}
	});

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	// Check access - admins and managers can see all tasks
	if (!isManager(locals.user) && task.assignedTo !== locals.user.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	return json({ task });
};

// Update task
export const PUT: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [existingTask] = await db
		.select()
		.from(tasks)
		.where(eq(tasks.id, params.id))
		.limit(1);

	if (!existingTask) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	// Assignees can update status, admins/managers can update everything
	const isAssignee = existingTask.assignedTo === locals.user.id;
	const canManage = isManager(locals.user);

	if (!isAssignee && !canManage) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const updateData: Record<string, unknown> = { updatedAt: new Date() };

	// Fields assignees can update
	if (body.status !== undefined) updateData.status = body.status;

	// Fields only admins/managers can update
	if (canManage) {
		if (body.title !== undefined) updateData.title = body.title;
		if (body.description !== undefined) updateData.description = body.description;
		if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo;
		if (body.priority !== undefined) updateData.priority = body.priority;
		if (body.dueAt !== undefined) updateData.dueAt = body.dueAt ? parsePacificDatetime(body.dueAt) : null;
		if (body.photoRequired !== undefined) updateData.photoRequired = body.photoRequired;
		if (body.notesRequired !== undefined) updateData.notesRequired = body.notesRequired;
	}

	const [updatedTask] = await db
		.update(tasks)
		.set(updateData)
		.where(eq(tasks.id, params.id))
		.returning();

	// Get full task with relations
	const [fullTask] = await db.query.tasks.findMany({
		where: eq(tasks.id, params.id),
		with: {
			assignee: { columns: { id: true, name: true } },
			template: { columns: { id: true, name: true } }
		}
	});

	// Notify if reassigned
	if (body.assignedTo && body.assignedTo !== existingTask.assignedTo) {
		await db.insert(notifications).values({
			userId: body.assignedTo,
			type: 'task_assigned',
			title: 'Task Assigned',
			body: `You have been assigned: ${updatedTask.title}`,
			data: { taskId: params.id }
		});
	}

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'update',
		entityType: 'task',
		entityId: params.id,
		beforeData: { status: existingTask.status, assignedTo: existingTask.assignedTo },
		afterData: { status: updatedTask.status, assignedTo: updatedTask.assignedTo },
		ipAddress: getClientAddress()
	});

	return json({ task: fullTask });
};

// Delete task (admin/manager only)
export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingTask] = await db
		.select()
		.from(tasks)
		.where(eq(tasks.id, params.id))
		.limit(1);

	if (!existingTask) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	await db.delete(tasks).where(eq(tasks.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'delete',
		entityType: 'task',
		entityId: params.id,
		beforeData: { title: existingTask.title },
		ipAddress: getClientAddress()
	});

	return json({ success: true });
};
