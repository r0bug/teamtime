import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks, taskCompletions, taskPhotos, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager, isAdmin } from '$lib/server/auth/roles';
import { processRulesForTrigger } from '$lib/server/services/task-rules';
import { awardTaskPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';

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
	const { notes, lat, lng, address, photos, cancelledByOfficeManager, cancellationReason, countsAsMissed } = body;

	// Only admins can set cancellation fields (used by Office Manager AI)
	const isCancellation = cancelledByOfficeManager === true;
	if (isCancellation && !isAdmin(locals.user)) {
		return json({ error: 'Only admins can cancel tasks with Office Manager flags' }, { status: 403 });
	}

	// Check requirements (skip for cancellations)
	if (!isCancellation) {
		if (task.notesRequired && !notes) {
			return json({ error: 'Notes are required to complete this task' }, { status: 400 });
		}

		if (task.photoRequired && (!photos || photos.length === 0)) {
			return json({ error: 'Photo is required to complete this task' }, { status: 400 });
		}
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
			address: address || null,
			// Office Manager cancellation fields (only set if admin and cancelling)
			cancelledByOfficeManager: isCancellation ? true : false,
			cancellationReason: isCancellation ? cancellationReason : null,
			countsAsMissed: isCancellation ? (countsAsMissed === true) : false
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
	const auditData: Record<string, unknown> = { completedBy: locals.user.id, notes };
	if (isCancellation) {
		auditData.cancelledByOfficeManager = true;
		auditData.cancellationReason = cancellationReason;
		auditData.countsAsMissed = countsAsMissed;
	}

	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: isCancellation ? 'cancel' : 'complete',
		entityType: 'task',
		entityId: params.id,
		afterData: auditData,
		ipAddress: getClientAddress()
	});

	// Process task_completed rules (only for non-cancelled completions with a template)
	if (!isCancellation && task.templateId) {
		await processRulesForTrigger('task_completed', {
			userId: locals.user.id,
			taskTemplateId: task.templateId,
			timestamp: new Date()
		});
	}

	// Award points for task completion
	let pointsAwarded = { points: 0, breakdown: {} as Record<string, number> };
	let achievementsEarned: { code: string; name: string }[] = [];
	try {
		// Award points to the person assigned to the task (not necessarily the completer)
		const pointsUserId = task.assignedTo || locals.user.id;
		pointsAwarded = await awardTaskPoints({
			userId: pointsUserId,
			taskId: params.id,
			dueAt: task.dueAt,
			completedAt: completion.completedAt,
			photoRequired: task.photoRequired,
			notesRequired: task.notesRequired,
			hasPhotos: photos && photos.length > 0,
			hasNotes: !!notes,
			wasCancelled: isCancellation,
			countsAsMissed: countsAsMissed === true
		});

		// Check for new achievements
		const newAchievements = await checkAndAwardAchievements(pointsUserId);
		achievementsEarned = newAchievements.map((a) => ({ code: a.code, name: a.name }));
	} catch (err) {
		console.error('Error awarding task points:', err);
	}

	return json({
		success: true,
		completion,
		points: pointsAwarded,
		achievements: achievementsEarned
	});
};
