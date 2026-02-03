/**
 * Force Clock-Out API Endpoint
 *
 * POST /api/clock/force-out
 *
 * Allows managers/admins to force clock-out staff members who forgot.
 * Records the incident, sends SMS notification, and checks for demerit escalation.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { forceClockOut } from '$lib/server/services/clock-out-warning-service';
import { processRulesForTrigger } from '$lib/server/services/task-rules';
import { db, auditLogs, timeEntries } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:clock:force-out');

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	// Auth check - must be manager or admin
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden: Manager or Admin role required' }, { status: 403 });
	}

	// Parse request body
	let body: { userId?: string; reason?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { userId, reason } = body;

	if (!userId) {
		return json({ error: 'userId is required' }, { status: 400 });
	}

	// Validate UUID format
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(userId)) {
		return json({ error: 'Invalid userId format' }, { status: 400 });
	}

	log.info(
		{ issuerId: locals.user.id, targetUserId: userId, reason },
		'Force clock-out requested'
	);

	// Get time entry before forcing clock-out (for audit log)
	const [entryBefore] = await db
		.select()
		.from(timeEntries)
		.where(eq(timeEntries.userId, userId))
		.limit(1);

	// Execute force clock-out
	const result = await forceClockOut(userId, locals.user.id, reason);

	if (!result.success) {
		return json({ error: result.error }, { status: 400 });
	}

	// Create audit log
	try {
		await db.insert(auditLogs).values({
			userId: locals.user.id,
			action: 'force_clock_out',
			entityType: 'time_entry',
			entityId: result.timeEntry?.id,
			beforeData: entryBefore ? { clockOut: null } : undefined,
			afterData: {
				clockOut: result.timeEntry?.clockOut,
				forcedBy: locals.user.id,
				reason: reason ?? null
			},
			ipAddress: getClientAddress()
		});
	} catch (err) {
		log.error({ error: err }, 'Failed to create audit log for force clock-out');
	}

	// Process task rules for clock_out trigger
	if (result.timeEntry) {
		try {
			const [entry] = await db
				.select()
				.from(timeEntries)
				.where(eq(timeEntries.id, result.timeEntry.id))
				.limit(1);

			if (entry) {
				await processRulesForTrigger('clock_out', {
					userId,
					locationId: entry.locationId ?? undefined,
					timestamp: result.timeEntry.clockOut
				});
			}
		} catch (err) {
			log.error({ error: err }, 'Failed to process task rules for force clock-out');
		}
	}

	return json({
		success: true,
		timeEntry: result.timeEntry,
		warning: {
			id: result.warning?.id,
			type: result.warning?.warningType,
			createdAt: result.warning?.createdAt
		},
		demerit: result.demerit ? {
			id: result.demerit.id,
			title: result.demerit.title,
			pointsDeducted: result.demerit.pointsDeducted
		} : null,
		smsResult: result.smsResult,
		pointsDeducted: result.pointsDeducted
	});
};
