import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, breakEntries } from '$lib/server/db';
import { eq, and, isNull } from 'drizzle-orm';
import { auditClockEvent } from '$lib/server/services/audit-service';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Find active break
	const [activeBreak] = await db
		.select()
		.from(breakEntries)
		.where(
			and(
				eq(breakEntries.userId, locals.user.id),
				isNull(breakEntries.breakEnd)
			)
		)
		.limit(1);

	if (!activeBreak) {
		return json({ error: 'Not on break' }, { status: 400 });
	}

	const now = new Date();

	const [updatedBreak] = await db
		.update(breakEntries)
		.set({ breakEnd: now })
		.where(eq(breakEntries.id, activeBreak.id))
		.returning();

	const breakDurationMinutes = Math.round(
		(now.getTime() - activeBreak.breakStart.getTime()) / (1000 * 60)
	);

	await auditClockEvent({
		userId: locals.user.id,
		timeEntryId: activeBreak.timeEntryId,
		action: 'break_end',
		ipAddress: getClientAddress()
	});

	return json({ success: true, breakEntry: updatedBreak, breakDurationMinutes });
};
