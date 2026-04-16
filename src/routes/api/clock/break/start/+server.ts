import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, timeEntries, breakEntries } from '$lib/server/db';
import { eq, and, isNull } from 'drizzle-orm';
import { auditClockEvent } from '$lib/server/services/audit-service';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
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

	// Check for existing active break
	const [existingBreak] = await db
		.select()
		.from(breakEntries)
		.where(
			and(
				eq(breakEntries.timeEntryId, activeEntry.id),
				isNull(breakEntries.breakEnd)
			)
		)
		.limit(1);

	if (existingBreak) {
		return json({ error: 'Already on break' }, { status: 400 });
	}

	const now = new Date();

	const [breakEntry] = await db
		.insert(breakEntries)
		.values({
			timeEntryId: activeEntry.id,
			userId: locals.user.id,
			breakStart: now
		})
		.returning();

	await auditClockEvent({
		userId: locals.user.id,
		timeEntryId: activeEntry.id,
		action: 'break_start',
		ipAddress: getClientAddress()
	});

	return json({ success: true, breakEntry });
};
