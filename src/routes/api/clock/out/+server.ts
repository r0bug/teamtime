import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, taskTemplates, tasks } from '$lib/server/db';
import { eq, and, isNull } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Find active time entry
	const [activeEntry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(
				eq(timeEntries.userId, locals.user.id),
				isNull(timeEntries.clockOut)
			)
		)
		.limit(1);

	if (!activeEntry) {
		return json({ error: 'Not clocked in' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const { lat, lng, address } = body;
	const now = new Date();

	// Update time entry with clock out
	const [entry] = await db
		.update(timeEntries)
		.set({
			clockOut: now,
			clockOutLat: lat || null,
			clockOutLng: lng || null,
			clockOutAddress: address || null,
			updatedAt: now
		})
		.where(eq(timeEntries.id, activeEntry.id))
		.returning();

	// Check for event-triggered tasks (clock-out)
	const triggeredTemplates = await db
		.select()
		.from(taskTemplates)
		.where(
			and(
				eq(taskTemplates.isActive, true),
				eq(taskTemplates.triggerEvent, 'clock_out')
			)
		);

	// Create tasks from triggered templates
	for (const template of triggeredTemplates) {
		await db.insert(tasks).values({
			templateId: template.id,
			title: template.name,
			description: template.description,
			assignedTo: locals.user.id,
			priority: 'medium',
			status: 'not_started',
			photoRequired: template.photoRequired,
			notesRequired: template.notesRequired,
			source: 'event_triggered',
			linkedEventId: entry.id,
			createdBy: null
		});
	}

	return json({ success: true, entry });
};
