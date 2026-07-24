/**
 * Demerit Review Service
 *
 * Auto-detected demerits are created with status 'pending' and take no effect
 * (no points deducted, no SMS to the employee) until a manager approves them.
 * Managers are notified by SMS when a demerit is pending review.
 *
 * Introduced 2026-07-18 after incorrect schedule data caused months of
 * wrongful automatic demerits (113 of 131 late-arrival warnings fired on days
 * the employee never clocked in at all).
 */

import { db, demerits, users } from '$lib/server/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { awardPoints } from './points-service';
import { audit } from './audit-service';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import type { Demerit } from '$lib/server/db/schema';

const log = createLogger('services:demerit-review');

const DEMERIT_TYPE_LABELS: Record<string, string> = {
	late_arrival: 'repeated late arrivals',
	clock_out_violation: 'repeated clock-out violations',
	attendance: 'attendance issues',
	task_performance: 'task performance',
	policy_violation: 'a policy violation',
	other: 'an infraction'
};

/**
 * Notify managers/admins by SMS that a demerit is pending review.
 * Failures are logged but never thrown — notification must not break the cron.
 */
export async function notifyManagersOfPendingDemerit(
	demerit: Demerit,
	employeeName: string
): Promise<void> {
	try {
		const managers = await db
			.select({ id: users.id, name: users.name, phone: users.phone })
			.from(users)
			.where(and(inArray(users.role, ['admin', 'manager']), eq(users.isActive, true)));

		const label = DEMERIT_TYPE_LABELS[demerit.type] ?? demerit.type;
		const message =
			`TeamTime: ${employeeName} has a pending demerit for ${label}. ` +
			`Review it at /admin/demerits before it takes effect. ` +
			`If the schedule is wrong, fix the schedule and dismiss it.`;

		for (const manager of managers) {
			if (!manager.phone) continue;
			const formatted = formatPhoneToE164(manager.phone);
			if (!formatted) continue;
			const result = await sendSMS(formatted, message);
			if (!result.success) {
				log.warn({ managerId: manager.id, error: result.error }, 'Manager notify SMS failed');
			}
		}
	} catch (err) {
		log.error({ error: err, demeritId: demerit.id }, 'Failed to notify managers of pending demerit');
	}
}

/**
 * Approve a pending demerit: it becomes active, points are deducted, and the
 * employee is notified by SMS.
 */
export async function approveDemerit(demeritId: string, reviewerId: string): Promise<Demerit> {
	const [demerit] = await db.select().from(demerits).where(eq(demerits.id, demeritId)).limit(1);
	if (!demerit) throw new Error('Demerit not found');
	if (demerit.status !== 'pending') throw new Error(`Demerit is ${demerit.status}, not pending`);

	const [updated] = await db
		.update(demerits)
		.set({ status: 'active' })
		.where(eq(demerits.id, demeritId))
		.returning();

	if (demerit.pointsDeducted > 0) {
		try {
			await awardPoints({
				userId: demerit.userId,
				basePoints: -demerit.pointsDeducted,
				category: 'attendance',
				action: `demerit_${demerit.type}`,
				description: `Demerit approved: ${demerit.title}`,
				sourceType: 'demerit',
				sourceId: demerit.id,
				metadata: { demeritId: demerit.id, approvedBy: reviewerId }
			});
		} catch (err) {
			log.error({ error: err, demeritId }, 'Failed to deduct points for approved demerit');
		}
	}

	// Notify the employee only now that a manager has confirmed the demerit
	const [user] = await db
		.select({ name: users.name, phone: users.phone })
		.from(users)
		.where(eq(users.id, demerit.userId))
		.limit(1);

	let smsResult: { success: boolean; sid?: string; error?: string } | undefined;
	if (user?.phone) {
		const formatted = formatPhoneToE164(user.phone);
		if (formatted) {
			const label = DEMERIT_TYPE_LABELS[demerit.type] ?? demerit.type;
			smsResult = await sendSMS(
				formatted,
				`You have received a demerit for ${label}. ${demerit.pointsDeducted} points have been deducted. Contact your manager with any questions.`
			);
			await db
				.update(demerits)
				.set({ smsNotified: smsResult.success, smsResult })
				.where(eq(demerits.id, demeritId));
		}
	}

	await audit({
		userId: reviewerId,
		action: 'update',
		entityType: 'demerit',
		entityId: demeritId,
		beforeData: { status: 'pending' },
		afterData: { status: 'active', pointsDeducted: demerit.pointsDeducted }
	});

	log.info({ demeritId, reviewerId }, 'Pending demerit approved');
	return updated;
}

/**
 * Dismiss a pending demerit: marked overturned, nothing is sent or deducted.
 */
export async function dismissDemerit(
	demeritId: string,
	reviewerId: string,
	reason?: string
): Promise<Demerit> {
	const [demerit] = await db.select().from(demerits).where(eq(demerits.id, demeritId)).limit(1);
	if (!demerit) throw new Error('Demerit not found');
	if (demerit.status !== 'pending') throw new Error(`Demerit is ${demerit.status}, not pending`);

	const [updated] = await db
		.update(demerits)
		.set({
			status: 'overturned',
			description: demerit.description + (reason ? ` [Dismissed: ${reason}]` : ' [Dismissed on review]')
		})
		.where(eq(demerits.id, demeritId))
		.returning();

	await audit({
		userId: reviewerId,
		action: 'update',
		entityType: 'demerit',
		entityId: demeritId,
		beforeData: { status: 'pending' },
		afterData: { status: 'overturned', reason: reason ?? null }
	});

	log.info({ demeritId, reviewerId, reason }, 'Pending demerit dismissed');
	return updated;
}

/**
 * List demerits for the review page: pending first, then recent resolved.
 */
export async function listDemeritsForReview(limit = 50) {
	const rows = await db
		.select({
			id: demerits.id,
			userId: demerits.userId,
			userName: users.name,
			type: demerits.type,
			status: demerits.status,
			title: demerits.title,
			description: demerits.description,
			pointsDeducted: demerits.pointsDeducted,
			createdAt: demerits.createdAt
		})
		.from(demerits)
		.innerJoin(users, eq(users.id, demerits.userId))
		.orderBy(desc(demerits.createdAt))
		.limit(limit);

	return {
		pending: rows.filter((r) => r.status === 'pending'),
		resolved: rows.filter((r) => r.status !== 'pending')
	};
}
