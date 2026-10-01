/**
 * Shift Coverage Service
 *
 * Staff who can't work a shift file a request; a manager reviews it, picks
 * eligible coworkers, and texts them; the first to reply claims it.
 * See PLAN-shift-coverage.md.
 *
 * Two rules drive the design:
 *   1. Claims are decided by the database, never by read-then-write. Several
 *      people will reply within seconds of the same broadcast.
 *   2. Eligibility is re-checked at claim time. Minutes pass between the
 *      broadcast and the reply, and the schedule can change in between.
 */

import {
	db,
	shifts,
	users,
	locations,
	userTypes,
	appSettings,
	notifications,
	smsLogs,
	shiftRequests,
	shiftRequestRecipients,
	shiftRequestResponses
} from '$lib/server/db';
import { and, eq, gte, lte, lt, ne, inArray, isNotNull } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { sendSMS, formatPhoneToE164 } from '$lib/server/twilio';
import { generateClaimCode } from '$lib/server/utils/parse-claim-reply';
import { toPacificTimeString, toPacificDateString, getPacificWeekStart } from '$lib/server/utils/timezone';
import { VENDOR_USER_TYPE_NAME } from '$lib/server/services/user-classification-service';
import { audit } from '$lib/server/services/audit-service';
import type { ShiftRequest } from '$lib/server/db/schema';

const log = createLogger('service:shift-coverage');

// ============================================================================
// CONFIG
// ============================================================================

export const COVERAGE_CONFIG = {
	DEFAULT_DEADLINE_HOURS: 4,
	MAX_WEEKLY_HOURS: 40,
	/** Stop broadcasting this close to shift start. */
	MIN_LEAD_MINUTES: 30,
	/** Short-turnaround warning: less than this between shifts. */
	SHORT_TURNAROUND_HOURS: 10
};

const SETTING_KEYS = {
	enabled: 'shift_coverage_enabled',
	requireApproval: 'shift_coverage_require_approval',
	autoApply: 'shift_coverage_auto_apply',
	deadlineHours: 'shift_coverage_default_deadline_hours',
	maxWeeklyHours: 'shift_coverage_max_weekly_hours'
} as const;

export async function getCoverageSettings(): Promise<{
	enabled: boolean;
	requireApproval: boolean;
	autoApply: boolean;
	deadlineHours: number;
	maxWeeklyHours: number;
}> {
	const rows = await db.select().from(appSettings);
	const map = new Map(rows.map((r) => [r.key, r.value]));
	const num = (key: string, fallback: number) => {
		const parsed = parseInt(map.get(key) ?? '', 10);
		return Number.isNaN(parsed) ? fallback : parsed;
	};
	return {
		enabled: map.get(SETTING_KEYS.enabled) !== 'false',
		requireApproval: map.get(SETTING_KEYS.requireApproval) !== 'false',
		autoApply: map.get(SETTING_KEYS.autoApply) !== 'false',
		deadlineHours: num(SETTING_KEYS.deadlineHours, COVERAGE_CONFIG.DEFAULT_DEADLINE_HOURS),
		maxWeeklyHours: num(SETTING_KEYS.maxWeeklyHours, COVERAGE_CONFIG.MAX_WEEKLY_HOURS)
	};
}

// ============================================================================
// FORMATTING
// ============================================================================

/** "Wed 9/17 10:00 AM-4:00 PM" — used in SMS and UI labels. */
export function formatShiftLabel(start: Date, end: Date): string {
	const day = new Date(start).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'numeric',
		day: 'numeric',
		timeZone: 'America/Los_Angeles'
	});
	return `${day} ${toPacificTimeString(start)}-${toPacificTimeString(end)}`;
}

/**
 * Broadcast body. Kept short on purpose: twilio.ts prepends a ~25-char header
 * to every message, so the composed length is what decides segment count.
 * The requester's reason is deliberately never included — it's manager-only.
 */
export function buildBroadcastMessage(params: {
	start: Date;
	end: Date;
	locationName?: string | null;
	claimCode: string;
	includeCode: boolean;
}): string {
	const where = params.locationName ? ` @ ${params.locationName}` : '';
	const label = formatShiftLabel(params.start, params.end);
	return params.includeCode
		? `Shift open ${label}${where}. Reply YES ${params.claimCode} to claim (first reply wins) or NO ${params.claimCode}.`
		: `Shift open ${label}${where}. Reply YES to claim (first reply wins) or NO to pass.`;
}

// ============================================================================
// ELIGIBILITY
// ============================================================================

export interface EligibleCandidate {
	userId: string;
	name: string;
	phone: string | null;
	eligible: boolean;
	hardBlocks: string[];
	warnings: string[];
}

/** Shifts overlap when each starts before the other ends. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
	return aStart < bEnd && bStart < aEnd;
}

/**
 * Score every staff member against a request. Returns all of them annotated
 * rather than a filtered list, so the manager can see who was excluded and why.
 */
export async function getEligibleStaff(request: {
	id?: string;
	startTime: Date;
	endTime: Date;
	requestedBy: string | null;
}): Promise<EligibleCandidate[]> {
	const settings = await getCoverageSettings();
	const start = new Date(request.startTime);
	const end = new Date(request.endTime);

	const staff = await db
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			role: users.role,
			isActive: users.isActive,
			typeName: userTypes.name
		})
		.from(users)
		.leftJoin(userTypes, eq(userTypes.id, users.userTypeId))
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	const candidateIds = staff
		.filter((u) => u.typeName !== VENDOR_USER_TYPE_NAME && u.id !== request.requestedBy)
		.map((u) => u.id);

	if (candidateIds.length === 0) return [];

	// Shifts in the surrounding week, used for both the overlap check and the
	// weekly-hours tally. One query rather than one per candidate.
	const weekStart = getPacificWeekStart(start);
	const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
	const windowStart = new Date(
		Math.min(weekStart.getTime(), start.getTime() - COVERAGE_CONFIG.SHORT_TURNAROUND_HOURS * 3600_000)
	);
	const windowEnd = new Date(
		Math.max(weekEnd.getTime(), end.getTime() + COVERAGE_CONFIG.SHORT_TURNAROUND_HOURS * 3600_000)
	);

	const nearbyShifts = await db
		.select({
			userId: shifts.userId,
			startTime: shifts.startTime,
			endTime: shifts.endTime
		})
		.from(shifts)
		.where(
			and(
				inArray(shifts.userId, candidateIds),
				gte(shifts.startTime, windowStart),
				lte(shifts.startTime, windowEnd)
			)
		);

	// Most recent SMS status per user, to spot opt-outs.
	const optedOut = new Set(
		(
			await db
				.selectDistinct({ userId: smsLogs.userId })
				.from(smsLogs)
				.where(and(eq(smsLogs.status, 'opt_out'), isNotNull(smsLogs.userId)))
		)
			.map((r) => r.userId)
			.filter((id): id is string => id !== null)
	);

	const byUser = new Map<string, { startTime: Date; endTime: Date }[]>();
	for (const s of nearbyShifts) {
		const list = byUser.get(s.userId) ?? [];
		list.push({ startTime: new Date(s.startTime), endTime: new Date(s.endTime) });
		byUser.set(s.userId, list);
	}

	const results: EligibleCandidate[] = [];

	for (const user of staff) {
		const hardBlocks: string[] = [];
		const warnings: string[] = [];

		if (user.typeName === VENDOR_USER_TYPE_NAME) continue; // vendors aren't staff
		if (user.id === request.requestedBy) continue; // can't cover your own shift

		const e164 = user.phone ? formatPhoneToE164(user.phone) : null;
		if (!user.phone) hardBlocks.push('No phone number on file');
		else if (!e164) hardBlocks.push(`Unusable phone number (${user.phone})`);

		if (optedOut.has(user.id)) hardBlocks.push('Opted out of SMS');

		const theirShifts = byUser.get(user.id) ?? [];

		const conflict = theirShifts.find((s) => overlaps(start, end, s.startTime, s.endTime));
		if (conflict) {
			hardBlocks.push(
				`Already scheduled ${toPacificTimeString(conflict.startTime)}-${toPacificTimeString(conflict.endTime)}`
			);
		}

		// Weekly hours, including the shift they'd be picking up.
		const weekHours = theirShifts
			.filter((s) => s.startTime >= weekStart && s.startTime < weekEnd)
			.reduce((sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / 3600_000, 0);
		const shiftHours = (end.getTime() - start.getTime()) / 3600_000;
		if (weekHours + shiftHours > settings.maxWeeklyHours) {
			warnings.push(
				`Would reach ${(weekHours + shiftHours).toFixed(1)}h this week (cap ${settings.maxWeeklyHours}h)`
			);
		}

		// Short turnaround: finishing shortly before this one starts.
		const turnaround = theirShifts
			.filter((s) => s.endTime <= start)
			.map((s) => (start.getTime() - s.endTime.getTime()) / 3600_000)
			.filter((h) => h < COVERAGE_CONFIG.SHORT_TURNAROUND_HOURS)
			.sort((a, b) => a - b)[0];
		if (turnaround !== undefined) {
			warnings.push(`Only ${turnaround.toFixed(1)}h off before this shift`);
		}

		results.push({
			userId: user.id,
			name: user.name,
			phone: user.phone,
			eligible: hardBlocks.length === 0,
			hardBlocks,
			warnings
		});
	}

	// Eligible first, then by name (the query already ordered by name).
	return results.sort((a, b) => Number(b.eligible) - Number(a.eligible));
}

// ============================================================================
// REQUEST LIFECYCLE
// ============================================================================

/** Generate a claim code not currently in use by a live request. */
async function reserveClaimCode(): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = generateClaimCode();
		const [clash] = await db
			.select({ id: shiftRequests.id })
			.from(shiftRequests)
			.where(
				and(
					eq(shiftRequests.claimCode, code),
					inArray(shiftRequests.status, ['open', 'pending_approval'])
				)
			)
			.limit(1);
		if (!clash) return code;
	}
	throw new Error('Could not allocate an unused claim code');
}

export async function createCoverageRequest(params: {
	shiftId: string;
	requestedBy: string;
	createdBy: string;
	requestType: 'sick' | 'personal' | 'appointment' | 'trade';
	reason?: string;
}): Promise<ShiftRequest> {
	const [shift] = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			locationId: shifts.locationId
		})
		.from(shifts)
		.where(eq(shifts.id, params.shiftId))
		.limit(1);

	if (!shift) throw new Error('Shift not found');
	if (shift.userId !== params.requestedBy) {
		throw new Error('That shift belongs to someone else');
	}
	if (new Date(shift.endTime) < new Date()) {
		throw new Error('That shift has already ended');
	}

	// One live request per shift.
	const [existing] = await db
		.select({ id: shiftRequests.id })
		.from(shiftRequests)
		.where(
			and(
				eq(shiftRequests.shiftId, params.shiftId),
				inArray(shiftRequests.status, ['open', 'pending_approval'])
			)
		)
		.limit(1);
	if (existing) throw new Error('There is already an open request for that shift');

	const settings = await getCoverageSettings();
	const start = new Date(shift.startTime);
	const end = new Date(shift.endTime);
	const code = await reserveClaimCode();

	const typeLabel = { sick: 'Sick', personal: 'Personal', appointment: 'Appointment', trade: 'Trade' }[
		params.requestType
	];

	const [created] = await db
		.insert(shiftRequests)
		.values({
			shiftId: shift.id,
			title: `${typeLabel} — ${formatShiftLabel(start, end)}`,
			requestedDate: toPacificDateString(start),
			startTime: start,
			endTime: end,
			locationId: shift.locationId,
			status: settings.requireApproval ? 'pending_approval' : 'open',
			requestType: params.requestType,
			requestedBy: params.requestedBy,
			createdBy: params.createdBy,
			reason: params.reason ?? null,
			claimCode: code,
			respondBy: defaultDeadline(start, settings.deadlineHours),
			// A trade moves two people's schedules, so it always waits for a manager.
			autoApply: params.requestType === 'trade' ? false : settings.autoApply
		})
		.returning();

	log.info(
		{ requestId: created.id, shiftId: shift.id, requestedBy: params.requestedBy, type: params.requestType },
		'Coverage request created'
	);

	await notifyManagers(
		'Shift coverage requested',
		`${await userName(params.requestedBy)} can't work ${formatShiftLabel(start, end)}.`,
		{ requestId: created.id }
	);

	return created;
}

/** Default response deadline: shift start minus lead time, capped at N hours out. */
export function defaultDeadline(shiftStart: Date, deadlineHours: number): Date {
	const beforeShift = new Date(shiftStart.getTime() - COVERAGE_CONFIG.MIN_LEAD_MINUTES * 60_000);
	const fromNow = new Date(Date.now() + deadlineHours * 3600_000);
	return new Date(Math.min(beforeShift.getTime(), fromNow.getTime()));
}

// ============================================================================
// BROADCAST
// ============================================================================

export async function broadcastRequest(params: {
	requestId: string;
	userIds: string[];
	actorId: string;
	message?: string;
	respondBy?: Date;
}): Promise<{ sent: number; failed: number; skipped: number; errors: string[] }> {
	const result = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

	const [request] = await db
		.select()
		.from(shiftRequests)
		.where(eq(shiftRequests.id, params.requestId))
		.limit(1);
	if (!request) throw new Error('Request not found');
	if (request.status !== 'pending_approval' && request.status !== 'open') {
		throw new Error(`Cannot broadcast a request that is ${request.status}`);
	}
	if (params.userIds.length === 0) throw new Error('Select at least one person to notify');

	const claimCode = request.claimCode ?? (await reserveClaimCode());

	const [location] = request.locationId
		? await db
				.select({ name: locations.name })
				.from(locations)
				.where(eq(locations.id, request.locationId))
				.limit(1)
		: [undefined];

	await db
		.update(shiftRequests)
		.set({
			status: 'open',
			claimCode,
			broadcastAt: new Date(),
			broadcastBy: params.actorId,
			respondBy: params.respondBy ?? request.respondBy,
			updatedAt: new Date()
		})
		.where(eq(shiftRequests.id, request.id));

	const recipients = await db
		.select({ id: users.id, name: users.name, phone: users.phone })
		.from(users)
		.where(inArray(users.id, params.userIds));

	// Sequential, mirroring scheduled-sms-processor.ts. One failure must not
	// abort the batch — the rest of the team still needs the message.
	for (const recipient of recipients) {
		const e164 = recipient.phone ? formatPhoneToE164(recipient.phone) : null;

		// Does this person already have another live invite? If so include the
		// code, since a bare YES from them would be ambiguous.
		const otherInvites = await countOpenInvites(recipient.id, request.id);
		const body =
			params.message ??
			buildBroadcastMessage({
				start: new Date(request.startTime),
				end: new Date(request.endTime),
				locationName: location?.name,
				claimCode,
				includeCode: otherInvites > 0
			});

		if (!e164) {
			await upsertRecipient(request.id, recipient.id, {
				phone: recipient.phone,
				deliveryStatus: 'skipped',
				errorMessage: 'No usable phone number'
			});
			result.skipped++;
			continue;
		}

		const sms = await sendSMS(e164, body, { sentByUserId: params.actorId });
		if (sms.success) {
			await upsertRecipient(request.id, recipient.id, {
				phone: recipient.phone,
				deliveryStatus: 'sent',
				sentAt: new Date()
			});
			result.sent++;
		} else {
			await upsertRecipient(request.id, recipient.id, {
				phone: recipient.phone,
				deliveryStatus: 'failed',
				errorMessage: sms.error ?? 'Unknown SMS error'
			});
			result.failed++;
			result.errors.push(`${recipient.name}: ${sms.error ?? 'failed'}`);
		}

		// In-app notification regardless of SMS outcome.
		await db
			.insert(notifications)
			.values({
				userId: recipient.id,
				type: 'shift_request',
				title: 'Shift needs coverage',
				body,
				data: { requestId: request.id, claimCode }
			})
			.catch(() => undefined);
	}

	await audit({
		userId: params.actorId,
		action: 'shift_coverage_broadcast',
		entityType: 'shift_request',
		entityId: request.id,
		metadata: { recipients: params.userIds.length, sent: result.sent, failed: result.failed }
	}).catch(() => undefined);

	log.info({ requestId: request.id, ...result }, 'Coverage request broadcast');
	return result;
}

async function upsertRecipient(
	requestId: string,
	userId: string,
	values: Partial<{
		phone: string | null;
		deliveryStatus: 'pending' | 'sent' | 'failed' | 'skipped';
		errorMessage: string;
		sentAt: Date;
	}>
): Promise<void> {
	await db
		.insert(shiftRequestRecipients)
		.values({ requestId, userId, ...values })
		.onConflictDoUpdate({
			target: [shiftRequestRecipients.requestId, shiftRequestRecipients.userId],
			set: values
		});
}

/** How many other open requests this user has been invited to. */
export async function countOpenInvites(userId: string, excludeRequestId?: string): Promise<number> {
	const rows = await db
		.select({ id: shiftRequests.id })
		.from(shiftRequestRecipients)
		.innerJoin(shiftRequests, eq(shiftRequests.id, shiftRequestRecipients.requestId))
		.where(
			and(
				eq(shiftRequestRecipients.userId, userId),
				eq(shiftRequests.status, 'open'),
				excludeRequestId ? ne(shiftRequests.id, excludeRequestId) : undefined
			)
		);
	return rows.length;
}

// ============================================================================
// CLAIMING
// ============================================================================

export type ClaimOutcome =
	| { ok: true; request: ShiftRequest; autoApplied: boolean }
	| {
			ok: false;
			reason: 'already_filled' | 'not_open' | 'conflict' | 'not_found' | 'not_invited';
			message: string;
	  };

/**
 * Was this user actually sent this offer?
 *
 * The claim code identifies a request; it is NOT a credential. Anyone who
 * learns one — forwarded text, shoulder-surfed screen — must still fail this
 * check, so authorization lives here rather than in the knowledge of the code.
 */
async function isInvitedRecipient(requestId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: shiftRequestRecipients.id })
		.from(shiftRequestRecipients)
		.where(
			and(
				eq(shiftRequestRecipients.requestId, requestId),
				eq(shiftRequestRecipients.userId, userId)
			)
		)
		.limit(1);
	return !!row;
}

/**
 * Claim a shift. Race-safe: the winner is decided by a conditional UPDATE, so
 * simultaneous replies can never both succeed.
 *
 * `requireRecipient` defaults to true: self-service claims must come from
 * someone who was actually invited. A manager assigning cover deliberately
 * passes false — they may hand the shift to anyone, invited or not. The two
 * authorization models are stated at the call site rather than implied, so a
 * new caller has to choose one.
 */
export async function claimShift(params: {
	requestId: string;
	userId: string;
	viaSms: boolean;
	requireRecipient?: boolean;
}): Promise<ClaimOutcome> {
	const [request] = await db
		.select()
		.from(shiftRequests)
		.where(eq(shiftRequests.id, params.requestId))
		.limit(1);

	if (!request) {
		return { ok: false, reason: 'not_found', message: 'That shift request no longer exists.' };
	}

	if (params.requireRecipient !== false && !(await isInvitedRecipient(request.id, params.userId))) {
		log.warn(
			{ requestId: request.id, userId: params.userId, viaSms: params.viaSms },
			'Claim rejected: user was not an invited recipient'
		);
		return {
			ok: false,
			reason: 'not_invited',
			message: "You weren't asked to cover this shift. Talk to a manager if you'd like to pick it up."
		};
	}
	if (request.status !== 'open') {
		return {
			ok: false,
			reason: request.status === 'filled' ? 'already_filled' : 'not_open',
			message:
				request.status === 'filled'
					? 'Thanks! That shift was already covered.'
					: `That request is no longer open (${request.status}).`
		};
	}

	// Re-validate at claim time — the schedule may have changed since the
	// broadcast went out.
	const conflict = await findConflictingShift(
		params.userId,
		new Date(request.startTime),
		new Date(request.endTime)
	);
	if (conflict) {
		return {
			ok: false,
			reason: 'conflict',
			message: `You're already scheduled ${toPacificTimeString(conflict.startTime)}-${toPacificTimeString(
				conflict.endTime
			)}, so that would overlap. Talk to a manager.`
		};
	}

	// The race is decided here. Zero rows back means someone else won.
	const won = await db
		.update(shiftRequests)
		.set({
			status: 'filled',
			filledBy: params.userId,
			filledAt: new Date(),
			updatedAt: new Date()
		})
		.where(and(eq(shiftRequests.id, request.id), eq(shiftRequests.status, 'open')))
		.returning({ id: shiftRequests.id });

	if (won.length === 0) {
		return { ok: false, reason: 'already_filled', message: 'Thanks! That shift was already covered.' };
	}

	await db
		.insert(shiftRequestResponses)
		.values({
			requestId: request.id,
			userId: params.userId,
			status: 'accepted',
			viaSms: params.viaSms
		})
		.onConflictDoNothing();

	let autoApplied = false;
	if (request.autoApply && request.shiftId) {
		await db
			.update(shifts)
			.set({ userId: params.userId, updatedAt: new Date() })
			.where(eq(shifts.id, request.shiftId));
		autoApplied = true;
	}

	await audit({
		userId: params.userId,
		action: 'shift_coverage_claimed',
		entityType: 'shift_request',
		entityId: request.id,
		metadata: { viaSms: params.viaSms, autoApplied, shiftId: request.shiftId }
	}).catch(() => undefined);

	log.info(
		{ requestId: request.id, userId: params.userId, viaSms: params.viaSms, autoApplied },
		'Shift claimed'
	);

	await notifyClaimOutcome(request, params.userId, autoApplied);

	const [updated] = await db
		.select()
		.from(shiftRequests)
		.where(eq(shiftRequests.id, request.id))
		.limit(1);

	return { ok: true, request: updated, autoApplied };
}

export async function declineRequest(params: {
	requestId: string;
	userId: string;
	viaSms: boolean;
	note?: string;
	requireRecipient?: boolean;
}): Promise<void> {
	// Same reasoning as claimShift: without this, anyone holding a code could
	// write response rows against a request they were never sent.
	if (params.requireRecipient !== false && !(await isInvitedRecipient(params.requestId, params.userId))) {
		log.warn(
			{ requestId: params.requestId, userId: params.userId },
			'Decline rejected: user was not an invited recipient'
		);
		return;
	}

	await db
		.insert(shiftRequestResponses)
		.values({
			requestId: params.requestId,
			userId: params.userId,
			status: 'declined',
			viaSms: params.viaSms,
			note: params.note ?? null
		})
		.onConflictDoNothing();
}

async function findConflictingShift(
	userId: string,
	start: Date,
	end: Date
): Promise<{ startTime: Date; endTime: Date } | null> {
	const [row] = await db
		.select({ startTime: shifts.startTime, endTime: shifts.endTime })
		.from(shifts)
		.where(and(eq(shifts.userId, userId), lt(shifts.startTime, end), gte(shifts.endTime, start)))
		.limit(1);
	return row ? { startTime: new Date(row.startTime), endTime: new Date(row.endTime) } : null;
}

// ============================================================================
// SMS REPLY RESOLUTION
// ============================================================================

export type ResolvedInvite =
	| { kind: 'resolved'; requestId: string }
	| { kind: 'ambiguous'; codes: string[] }
	| { kind: 'none' };

/**
 * Map an inbound reply to one of the user's open invites.
 * A bare keyword resolves only when there's exactly one — otherwise we ask
 * rather than guess which shift they meant.
 */
export async function resolveInviteForReply(
	userId: string,
	code: string | null
): Promise<ResolvedInvite> {
	const open = await db
		.select({ id: shiftRequests.id, claimCode: shiftRequests.claimCode })
		.from(shiftRequestRecipients)
		.innerJoin(shiftRequests, eq(shiftRequests.id, shiftRequestRecipients.requestId))
		.where(and(eq(shiftRequestRecipients.userId, userId), eq(shiftRequests.status, 'open')));

	if (open.length === 0) return { kind: 'none' };

	if (code) {
		const match = open.find((r) => r.claimCode?.toUpperCase() === code.toUpperCase());
		return match ? { kind: 'resolved', requestId: match.id } : { kind: 'none' };
	}

	if (open.length === 1) return { kind: 'resolved', requestId: open[0].id };

	return {
		kind: 'ambiguous',
		codes: open.map((r) => r.claimCode ?? '?').filter(Boolean)
	};
}

// ============================================================================
// EXPIRY / REMINDERS (called from /api/clock/cron)
// ============================================================================

export async function expireStaleRequests(): Promise<number> {
	const now = new Date();
	const stale = await db
		.select({
			id: shiftRequests.id,
			startTime: shiftRequests.startTime,
			endTime: shiftRequests.endTime
		})
		.from(shiftRequests)
		.where(
			and(
				inArray(shiftRequests.status, ['open', 'pending_approval']),
				isNotNull(shiftRequests.respondBy),
				lt(shiftRequests.respondBy, now)
			)
		);

	if (stale.length === 0) return 0;

	await db
		.update(shiftRequests)
		.set({ status: 'expired', updatedAt: now })
		.where(
			inArray(
				shiftRequests.id,
				stale.map((r) => r.id)
			)
		);

	for (const req of stale) {
		await notifyManagers(
			'Shift still uncovered',
			`No one picked up ${formatShiftLabel(new Date(req.startTime), new Date(req.endTime))}.`,
			{ requestId: req.id }
		);
	}

	log.info({ count: stale.length }, 'Expired stale coverage requests');
	return stale.length;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

async function userName(userId: string): Promise<string> {
	const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
	return row?.name ?? 'Someone';
}

async function notifyManagers(
	title: string,
	body: string,
	data: Record<string, unknown>
): Promise<void> {
	try {
		const managers = await db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.isActive, true), inArray(users.role, ['admin', 'manager'])));
		if (managers.length === 0) return;
		await db.insert(notifications).values(
			managers.map((m) => ({
				userId: m.id,
				type: 'shift_request' as const,
				title,
				body,
				data
			}))
		);
	} catch (err) {
		log.warn({ err }, 'Failed to notify managers of coverage event');
	}
}

/** Tell the requester (and managers) that the shift got picked up. */
async function notifyClaimOutcome(
	request: ShiftRequest,
	claimerId: string,
	autoApplied: boolean
): Promise<void> {
	const claimer = await userName(claimerId);
	const label = formatShiftLabel(new Date(request.startTime), new Date(request.endTime));

	if (request.requestedBy) {
		const [requester] = await db
			.select({ id: users.id, phone: users.phone })
			.from(users)
			.where(eq(users.id, request.requestedBy))
			.limit(1);

		if (requester) {
			await db
				.insert(notifications)
				.values({
					userId: requester.id,
					type: 'shift_request',
					title: 'Your shift is covered',
					body: `${claimer} picked up ${label}.`,
					data: { requestId: request.id }
				})
				.catch(() => undefined);

			const e164 = requester.phone ? formatPhoneToE164(requester.phone) : null;
			if (e164) {
				await sendSMS(e164, `${claimer} picked up your ${label} shift. You're covered.`);
			}
		}
	}

	await notifyManagers(
		'Shift covered',
		`${claimer} took ${label}${autoApplied ? '' : ' (needs your confirmation)'}.`,
		{ requestId: request.id }
	);
}

/** Tell everyone else on the invite list that it's taken. */
export async function notifyLosers(requestId: string, winnerId: string): Promise<void> {
	const others = await db
		.select({ userId: shiftRequestRecipients.userId, phone: users.phone })
		.from(shiftRequestRecipients)
		.innerJoin(users, eq(users.id, shiftRequestRecipients.userId))
		.where(
			and(
				eq(shiftRequestRecipients.requestId, requestId),
				ne(shiftRequestRecipients.userId, winnerId),
				eq(shiftRequestRecipients.deliveryStatus, 'sent')
			)
		);

	for (const other of others) {
		const e164 = other.phone ? formatPhoneToE164(other.phone) : null;
		if (e164) await sendSMS(e164, 'That shift has been covered — thanks!');
	}
}
