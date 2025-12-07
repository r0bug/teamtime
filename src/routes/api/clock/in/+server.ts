import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, shifts, taskTemplates, tasks } from '$lib/server/db';
import { eq, and, isNull, lte, gte } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if already clocked in
	const [existingEntry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(
				eq(timeEntries.userId, locals.user.id),
				isNull(timeEntries.clockOut)
			)
		)
		.limit(1);

	if (existingEntry) {
		return json({ error: 'Already clocked in' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const { lat, lng, address } = body;
	const now = new Date();

	// Find matching shift
	const [currentShift] = await db
		.select()
		.from(shifts)
		.where(
			and(
				eq(shifts.userId, locals.user.id),
				lte(shifts.startTime, new Date(now.getTime() + 30 * 60 * 1000)), // Can clock in 30 min early
				gte(shifts.endTime, now)
			)
		)
		.limit(1);

	// Create time entry
	const [entry] = await db
		.insert(timeEntries)
		.values({
			userId: locals.user.id,
			shiftId: currentShift?.id || null,
			clockIn: now,
			clockInLat: lat || null,
			clockInLng: lng || null,
			clockInAddress: address || null
		})
		.returning();

	// Check for event-triggered tasks (first clock-in)
	const triggeredTemplates = await db
		.select()
		.from(taskTemplates)
		.where(
			and(
				eq(taskTemplates.isActive, true),
				eq(taskTemplates.triggerEvent, 'clock_in')
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
