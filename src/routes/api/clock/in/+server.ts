import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, shifts, taskTemplates, tasks, users } from '$lib/server/db';
import { eq, and, isNull, lte, gte } from 'drizzle-orm';
import {
	processRulesForTrigger,
	isFirstClockInAtLocation
} from '$lib/server/services/task-rules';
import { awardClockInPoints } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Get user's primary location
	const [userWithLocation] = await db
		.select({ primaryLocationId: users.primaryLocationId })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

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
	const { lat, lng, address, locationId } = body;
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

	// Determine location (from body, shift, user's primary location, or null)
	const entryLocationId = locationId || currentShift?.locationId || userWithLocation?.primaryLocationId || null;

	// Create time entry
	const [entry] = await db
		.insert(timeEntries)
		.values({
			userId: locals.user.id,
			shiftId: currentShift?.id || null,
			locationId: entryLocationId || null,
			clockIn: now,
			clockInLat: lat || null,
			clockInLng: lng || null,
			clockInAddress: address || null
		})
		.returning();

	// Process legacy template triggers (for backwards compatibility)
	const triggeredTemplates = await db
		.select()
		.from(taskTemplates)
		.where(
			and(
				eq(taskTemplates.isActive, true),
				eq(taskTemplates.triggerEvent, 'clock_in')
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
		locationId: entryLocationId || undefined,
		timestamp: now
	};

	// Process clock_in rules
	await processRulesForTrigger('clock_in', context);

	// Check for first_clock_in rules
	if (entryLocationId) {
		const isFirst = await isFirstClockInAtLocation(locals.user.id, entryLocationId);
		if (isFirst) {
			await processRulesForTrigger('first_clock_in', context);
		}
	}

	// Award points for clock-in
	let pointsAwarded = { points: 0, action: 'clock_in' };
	let achievementsEarned: { code: string; name: string }[] = [];
	try {
		pointsAwarded = await awardClockInPoints(locals.user.id, entry.id, now);

		// Check for new achievements
		const newAchievements = await checkAndAwardAchievements(locals.user.id);
		achievementsEarned = newAchievements.map((a) => ({ code: a.code, name: a.name }));
	} catch (err) {
		console.error('Error awarding clock-in points:', err);
	}

	return json({
		success: true,
		entry,
		points: pointsAwarded,
		achievements: achievementsEarned
	});
};
