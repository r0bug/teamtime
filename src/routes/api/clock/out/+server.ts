import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, taskTemplates, tasks } from '$lib/server/db';
import { eq, and, isNull } from 'drizzle-orm';
import {
	processRulesForTrigger,
	isLastClockOutAtLocation
} from '$lib/server/services/task-rules';

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

	// Check if this is the last clock-out BEFORE updating (while user is still shown as clocked in)
	const locationId = activeEntry.locationId;
	let isLast = false;
	if (locationId) {
		isLast = await isLastClockOutAtLocation(locals.user.id, locationId);
	}

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

	// Process legacy template triggers (for backwards compatibility)
	const triggeredTemplates = await db
		.select()
		.from(taskTemplates)
		.where(
			and(
				eq(taskTemplates.isActive, true),
				eq(taskTemplates.triggerEvent, 'clock_out')
			)
		);

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

	// Process new assignment rules
	const context = {
		userId: locals.user.id,
		locationId: locationId || undefined,
		timestamp: now
	};

	// Process clock_out rules
	await processRulesForTrigger('clock_out', context);

	// Process last_clock_out rules if this was the last person
	if (isLast) {
		await processRulesForTrigger('last_clock_out', context);
	}

	return json({ success: true, entry });
};
