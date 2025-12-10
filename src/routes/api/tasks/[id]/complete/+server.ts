import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks, taskCompletions, taskPhotos, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [task] = await db
		.select()
		.from(tasks)
		.where(eq(tasks.id, params.id))
		.limit(1);

	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	// Check access - admins/managers can complete any task
	if (task.assignedTo !== locals.user.id && !isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	if (task.status === 'completed') {
		return json({ error: 'Task already completed' }, { status: 400 });
	}

	const body = await request.json();
	const { notes, lat, lng, address, photos } = body;

	// Check requirements
	if (task.notesRequired && !notes) {
		return json({ error: 'Notes are required to complete this task' }, { status: 400 });
	}

	if (task.photoRequired && (!photos || photos.length === 0)) {
		return json({ error: 'Photo is required to complete this task' }, { status: 400 });
	}

	// Create completion record
	const [completion] = await db
		.insert(taskCompletions)
		.values({
			taskId: params.id,
			completedBy: locals.user.id,
			completedAt: new Date(),
			notes: notes || null,
			lat: lat || null,
			lng: lng || null,
			address: address || null
		})
		.returning();

	// Associate photos with completion
	if (photos && photos.length > 0) {
		for (const photo of photos) {
			await db.insert(taskPhotos).values({
				taskCompletionId: completion.id,
				taskId: params.id,
				filePath: photo.filePath,
				originalName: photo.originalName,
				mimeType: photo.mimeType || 'image/jpeg',
				sizeBytes: photo.sizeBytes || 0,
				lat: photo.lat || null,
				lng: photo.lng || null,
				capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : null
			});
		}
	}

	// Update task status
	await db
		.update(tasks)
		.set({ status: 'completed', updatedAt: new Date() })
		.where(eq(tasks.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'complete',
		entityType: 'task',
		entityId: params.id,
		afterData: { completedBy: locals.user.id, notes },
		ipAddress: getClientAddress()
	});

	return json({ success: true, completion });
};
