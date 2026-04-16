/**
 * Schedule Template Service
 *
 * Manages saved weekly shift patterns (templates) and the logic that:
 * - Creates/reads/updates/deletes templates
 * - Materializes templates into concrete shifts over a date range
 * - Detects drift between actual shifts and the template
 * - Auto-applies the active default template to future weeks
 *
 * Time model: templates store wall-clock HH:MM in Pacific time. Materialization
 * pins those times to concrete calendar dates via createPacificDateTime.
 * dayOfWeek convention: 0 = Sunday, 6 = Saturday (matches existing /admin/schedule).
 */

import { db, shifts, users, appSettings } from '$lib/server/db';
import { scheduleTemplates, scheduleTemplateShifts } from '$lib/server/db/schema';
import { and, eq, gte, lt, inArray, sql } from 'drizzle-orm';
import {
	createPacificDateTime,
	toPacificDateString,
	toPacificTimeString,
	getPacificDateParts,
	getPacificWeekStart
} from '$lib/server/utils/timezone';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:schedule-template');

// ---------- Types ----------

export interface TemplateShiftInput {
	dayOfWeek: number; // 0-6 (Sunday = 0)
	startTime: string; // "HH:MM"
	endTime: string; // "HH:MM"
	userId: string;
	locationId?: string | null;
	notes?: string | null;
}

export interface CreateTemplateInput {
	name: string;
	description?: string | null;
	isActive?: boolean;
	setAsDefault?: boolean;
	effectiveFrom?: Date | null;
	effectiveTo?: Date | null;
	shifts: TemplateShiftInput[];
	createdBy?: string | null;
}

export interface UpdateTemplateInput {
	name?: string;
	description?: string | null;
	isActive?: boolean;
	effectiveFrom?: Date | null;
	effectiveTo?: Date | null;
	shifts?: TemplateShiftInput[]; // if provided, replaces all existing shifts
}

export interface TemplateWithShifts {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
	effectiveFrom: Date | null;
	effectiveTo: Date | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
	shifts: Array<{
		id: string;
		templateId: string;
		dayOfWeek: number;
		startTime: string;
		endTime: string;
		userId: string;
		locationId: string | null;
		notes: string | null;
	}>;
}

export interface TemplateSlotInstance {
	templateShiftId: string;
	userId: string;
	locationId: string | null;
	notes: string | null;
	date: string; // YYYY-MM-DD Pacific
	startTime: string; // "HH:MM"
	endTime: string; // "HH:MM"
	startUtc: Date;
	endUtc: Date;
	slotKey: string; // userId|date|startTime — stable identity for decisions map
}

export interface ExistingShiftLite {
	id: string;
	userId: string;
	locationId: string | null;
	startTime: Date;
	endTime: Date;
	notes: string | null;
	templateShiftId: string | null;
}

export interface ApplicationPlan {
	templateId: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	toCreate: TemplateSlotInstance[];
	conflicts: Array<{ slot: TemplateSlotInstance; existing: ExistingShiftLite[] }>;
	alreadyMatching: Array<{ slot: TemplateSlotInstance; existingShiftId: string }>;
	summary: { createCount: number; conflictCount: number; matchingCount: number };
}

export type ConflictDecision = 'skip' | 'overwrite' | 'add_alongside';

export interface CommitResult {
	created: number;
	deleted: number;
	skipped: number;
	errors: string[];
}

export interface DriftReport {
	templateId: string;
	startDate: string;
	endDate: string;
	missing: TemplateSlotInstance[];
	extra: ExistingShiftLite[];
	modified: Array<{ slot: TemplateSlotInstance; shift: ExistingShiftLite; diffs: string[] }>;
	matching: ExistingShiftLite[];
	summary: {
		missingCount: number;
		extraCount: number;
		modifiedCount: number;
		matchingCount: number;
		driftPercent: number; // 0-100
	};
}

// ---------- Helpers ----------

function slotKey(userId: string, date: string, startTime: string): string {
	return `${userId}|${date}|${startTime}`;
}

/**
 * Convert a stored DB start time to the Pacific "HH:MM" wall-clock string.
 * Uses 24-hour format (toPacificTimeString returns locale format, so we re-derive).
 */
function to24HourPacific(date: Date): string {
	const parts = getPacificDateParts(date);
	return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/**
 * Build a slotKey from an existing shift for conflict lookup.
 */
function shiftSlotKey(shift: { userId: string; startTime: Date }): string {
	return slotKey(shift.userId, toPacificDateString(shift.startTime), to24HourPacific(shift.startTime));
}

/**
 * Materialize a single template shift onto a concrete date.
 * Handles overnight shifts (end < start → rolls to next day).
 */
function materializeSlot(
	tShift: {
		id: string;
		userId: string;
		locationId: string | null;
		notes: string | null;
		dayOfWeek: number;
		startTime: string;
		endTime: string;
	},
	targetDate: string
): TemplateSlotInstance {
	const [sh, sm] = tShift.startTime.split(':').map(Number);
	const [eh, em] = tShift.endTime.split(':').map(Number);
	const startUtc = createPacificDateTime(targetDate, sh, sm);
	let endUtc = createPacificDateTime(targetDate, eh, em);
	// Overnight shift: if end <= start, roll end to the next calendar day
	if (endUtc.getTime() <= startUtc.getTime()) {
		endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
	}
	return {
		templateShiftId: tShift.id,
		userId: tShift.userId,
		locationId: tShift.locationId,
		notes: tShift.notes,
		date: targetDate,
		startTime: tShift.startTime,
		endTime: tShift.endTime,
		startUtc,
		endUtc,
		slotKey: slotKey(tShift.userId, targetDate, tShift.startTime)
	};
}

/**
 * Return array of YYYY-MM-DD Pacific dates from startDate (inclusive) to endDate (inclusive).
 */
function enumerateDates(startDate: string, endDate: string): string[] {
	const out: string[] = [];
	let [y, m, d] = startDate.split('-').map(Number);
	const endParts = endDate.split('-').map(Number);
	const endTs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
	let cursorTs = Date.UTC(y, m - 1, d);
	while (cursorTs <= endTs) {
		const cursor = new Date(cursorTs);
		out.push(toPacificDateString(cursor));
		cursorTs += 24 * 60 * 60 * 1000;
	}
	return out;
}

function dayOfWeekForPacificDate(dateStr: string): number {
	// Anchor at Pacific noon to avoid DST edge cases shifting the day
	return getPacificDateParts(createPacificDateTime(dateStr, 12, 0)).weekday;
}

// ---------- CRUD ----------

export async function listTemplates(): Promise<TemplateWithShifts[]> {
	const templates = await db.select().from(scheduleTemplates).orderBy(scheduleTemplates.name);
	if (templates.length === 0) return [];
	const ids = templates.map((t) => t.id);
	const allShifts = await db
		.select()
		.from(scheduleTemplateShifts)
		.where(inArray(scheduleTemplateShifts.templateId, ids));
	const byTemplate = new Map<string, typeof allShifts>();
	for (const s of allShifts) {
		if (!byTemplate.has(s.templateId)) byTemplate.set(s.templateId, []);
		byTemplate.get(s.templateId)!.push(s);
	}
	return templates.map((t) => ({ ...t, shifts: byTemplate.get(t.id) || [] }));
}

export async function getTemplate(id: string): Promise<TemplateWithShifts | null> {
	const [tpl] = await db
		.select()
		.from(scheduleTemplates)
		.where(eq(scheduleTemplates.id, id))
		.limit(1);
	if (!tpl) return null;
	const tShifts = await db
		.select()
		.from(scheduleTemplateShifts)
		.where(eq(scheduleTemplateShifts.templateId, id));
	return { ...tpl, shifts: tShifts };
}

export async function getDefaultTemplate(): Promise<TemplateWithShifts | null> {
	const [tpl] = await db
		.select()
		.from(scheduleTemplates)
		.where(eq(scheduleTemplates.isDefault, true))
		.limit(1);
	if (!tpl) return null;
	return getTemplate(tpl.id);
}

export async function createTemplate(input: CreateTemplateInput): Promise<TemplateWithShifts> {
	validateTemplateShiftInputs(input.shifts);

	return await db.transaction(async (tx) => {
		if (input.setAsDefault) {
			// Unset any existing default in the same transaction to satisfy the partial unique index
			await tx
				.update(scheduleTemplates)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(eq(scheduleTemplates.isDefault, true));
		}

		const [tpl] = await tx
			.insert(scheduleTemplates)
			.values({
				name: input.name,
				description: input.description ?? null,
				isActive: input.isActive ?? true,
				isDefault: input.setAsDefault ?? false,
				effectiveFrom: input.effectiveFrom ?? null,
				effectiveTo: input.effectiveTo ?? null,
				createdBy: input.createdBy ?? null
			})
			.returning();

		if (input.shifts.length > 0) {
			await tx.insert(scheduleTemplateShifts).values(
				input.shifts.map((s) => ({
					templateId: tpl.id,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
					userId: s.userId,
					locationId: s.locationId ?? null,
					notes: s.notes ?? null
				}))
			);
		}

		const tShifts = await tx
			.select()
			.from(scheduleTemplateShifts)
			.where(eq(scheduleTemplateShifts.templateId, tpl.id));
		return { ...tpl, shifts: tShifts };
	});
}

export async function updateTemplate(
	id: string,
	patch: UpdateTemplateInput
): Promise<TemplateWithShifts> {
	if (patch.shifts) validateTemplateShiftInputs(patch.shifts);

	return await db.transaction(async (tx) => {
		const metadataUpdate: Record<string, unknown> = { updatedAt: new Date() };
		if (patch.name !== undefined) metadataUpdate.name = patch.name;
		if (patch.description !== undefined) metadataUpdate.description = patch.description;
		if (patch.isActive !== undefined) metadataUpdate.isActive = patch.isActive;
		if (patch.effectiveFrom !== undefined) metadataUpdate.effectiveFrom = patch.effectiveFrom;
		if (patch.effectiveTo !== undefined) metadataUpdate.effectiveTo = patch.effectiveTo;

		if (Object.keys(metadataUpdate).length > 1) {
			await tx.update(scheduleTemplates).set(metadataUpdate).where(eq(scheduleTemplates.id, id));
		}

		if (patch.shifts !== undefined) {
			await tx.delete(scheduleTemplateShifts).where(eq(scheduleTemplateShifts.templateId, id));
			if (patch.shifts.length > 0) {
				await tx.insert(scheduleTemplateShifts).values(
					patch.shifts.map((s) => ({
						templateId: id,
						dayOfWeek: s.dayOfWeek,
						startTime: s.startTime,
						endTime: s.endTime,
						userId: s.userId,
						locationId: s.locationId ?? null,
						notes: s.notes ?? null
					}))
				);
			}
		}

		const [tpl] = await tx
			.select()
			.from(scheduleTemplates)
			.where(eq(scheduleTemplates.id, id))
			.limit(1);
		if (!tpl) throw new Error('Template not found after update');
		const tShifts = await tx
			.select()
			.from(scheduleTemplateShifts)
			.where(eq(scheduleTemplateShifts.templateId, id));
		return { ...tpl, shifts: tShifts };
	});
}

export async function deleteTemplate(id: string): Promise<void> {
	const [tpl] = await db
		.select()
		.from(scheduleTemplates)
		.where(eq(scheduleTemplates.id, id))
		.limit(1);
	if (!tpl) throw new Error('Template not found');
	if (tpl.isDefault) {
		throw new Error('Cannot delete the default template. Mark another template as default first.');
	}
	await db.delete(scheduleTemplates).where(eq(scheduleTemplates.id, id));
}

export async function setDefaultTemplate(id: string): Promise<void> {
	await db.transaction(async (tx) => {
		const [tpl] = await tx
			.select()
			.from(scheduleTemplates)
			.where(eq(scheduleTemplates.id, id))
			.limit(1);
		if (!tpl) throw new Error('Template not found');

		// Unset current default (partial unique index requires this to be done first)
		await tx
			.update(scheduleTemplates)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(eq(scheduleTemplates.isDefault, true));

		await tx
			.update(scheduleTemplates)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(eq(scheduleTemplates.id, id));
	});
}

function validateTemplateShiftInputs(input: TemplateShiftInput[]): void {
	for (const s of input) {
		if (s.dayOfWeek < 0 || s.dayOfWeek > 6) {
			throw new Error(`dayOfWeek must be 0-6, got ${s.dayOfWeek}`);
		}
		if (!/^\d{2}:\d{2}$/.test(s.startTime) || !/^\d{2}:\d{2}$/.test(s.endTime)) {
			throw new Error(`startTime and endTime must be HH:MM, got ${s.startTime}-${s.endTime}`);
		}
	}
}

// ---------- Save week as template ----------

export async function saveWeekAsTemplate(
	weekStartDate: Date,
	meta: { name: string; description?: string | null; createdBy?: string | null; setAsDefault?: boolean }
): Promise<TemplateWithShifts> {
	const weekStart = getPacificWeekStart(weekStartDate);
	const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

	const weekShifts = await db
		.select({
			userId: shifts.userId,
			locationId: shifts.locationId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes
		})
		.from(shifts)
		.where(and(gte(shifts.startTime, weekStart), lt(shifts.startTime, weekEnd)));

	const templateShiftInputs: TemplateShiftInput[] = weekShifts.map((s) => {
		const dayOfWeek = dayOfWeekForPacificDate(toPacificDateString(s.startTime));
		return {
			dayOfWeek,
			startTime: to24HourPacific(s.startTime),
			endTime: to24HourPacific(s.endTime),
			userId: s.userId,
			locationId: s.locationId,
			notes: s.notes
		};
	});

	return createTemplate({
		name: meta.name,
		description: meta.description ?? null,
		setAsDefault: meta.setAsDefault ?? false,
		shifts: templateShiftInputs,
		createdBy: meta.createdBy ?? null
	});
}

// ---------- Planner ----------

export async function planApplication(params: {
	templateId: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
}): Promise<ApplicationPlan> {
	const template = await getTemplate(params.templateId);
	if (!template) throw new Error('Template not found');

	// Build all target slot instances from the template across the date range
	const dates = enumerateDates(params.startDate, params.endDate);
	const slots: TemplateSlotInstance[] = [];
	for (const date of dates) {
		const dow = dayOfWeekForPacificDate(date);
		for (const tShift of template.shifts) {
			if (tShift.dayOfWeek !== dow) continue;
			slots.push(materializeSlot(tShift, date));
		}
	}

	if (slots.length === 0) {
		return {
			templateId: params.templateId,
			startDate: params.startDate,
			endDate: params.endDate,
			toCreate: [],
			conflicts: [],
			alreadyMatching: [],
			summary: { createCount: 0, conflictCount: 0, matchingCount: 0 }
		};
	}

	// Filter out inactive users — skip them and log
	const uniqueUserIds = [...new Set(slots.map((s) => s.userId))];
	const userRows = await db
		.select({ id: users.id, isActive: users.isActive })
		.from(users)
		.where(inArray(users.id, uniqueUserIds));
	const activeUserIds = new Set(userRows.filter((u) => u.isActive).map((u) => u.id));
	const filteredSlots = slots.filter((s) => {
		if (!activeUserIds.has(s.userId)) {
			log.info({ userId: s.userId, date: s.date }, 'Skipping template slot for inactive user');
			return false;
		}
		return true;
	});

	// Fetch existing shifts in the date range for conflict detection
	const rangeStart = createPacificDateTime(params.startDate, 0, 0);
	const rangeEnd = new Date(createPacificDateTime(params.endDate, 0, 0).getTime() + 24 * 60 * 60 * 1000);

	const existing = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			locationId: shifts.locationId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes,
			templateShiftId: shifts.templateShiftId
		})
		.from(shifts)
		.where(and(gte(shifts.startTime, rangeStart), lt(shifts.startTime, rangeEnd)));

	// Index existing shifts by (userId|date|startTime) for matching
	const existingByKey = new Map<string, ExistingShiftLite[]>();
	for (const e of existing) {
		const key = shiftSlotKey(e);
		if (!existingByKey.has(key)) existingByKey.set(key, []);
		existingByKey.get(key)!.push(e);
	}
	// Also index ALL existing shifts by userId|date so we can find partial conflicts
	// (same user + same day but different start time)
	const existingByUserDate = new Map<string, ExistingShiftLite[]>();
	for (const e of existing) {
		const k = `${e.userId}|${toPacificDateString(e.startTime)}`;
		if (!existingByUserDate.has(k)) existingByUserDate.set(k, []);
		existingByUserDate.get(k)!.push(e);
	}

	const toCreate: TemplateSlotInstance[] = [];
	const conflicts: ApplicationPlan['conflicts'] = [];
	const alreadyMatching: ApplicationPlan['alreadyMatching'] = [];

	for (const slot of filteredSlots) {
		const exactMatches = existingByKey.get(slot.slotKey) || [];
		if (exactMatches.length > 0) {
			const match = exactMatches[0];
			// Check if all fields match (times + location). Different location or endTime = conflict.
			const existingEndHHMM = to24HourPacific(match.endTime);
			const endMatches = existingEndHHMM === slot.endTime;
			const locationMatches = (match.locationId ?? null) === (slot.locationId ?? null);
			if (endMatches && locationMatches) {
				alreadyMatching.push({ slot, existingShiftId: match.id });
			} else {
				conflicts.push({ slot, existing: exactMatches });
			}
			continue;
		}

		// No exact start-time match. Check if there's ANY shift for this user on this date.
		const userDateKey = `${slot.userId}|${slot.date}`;
		const sameDayShifts = existingByUserDate.get(userDateKey) || [];
		if (sameDayShifts.length > 0) {
			// Partial conflict: user already has a shift on this day at a different time
			conflicts.push({ slot, existing: sameDayShifts });
		} else {
			toCreate.push(slot);
		}
	}

	return {
		templateId: params.templateId,
		startDate: params.startDate,
		endDate: params.endDate,
		toCreate,
		conflicts,
		alreadyMatching,
		summary: {
			createCount: toCreate.length,
			conflictCount: conflicts.length,
			matchingCount: alreadyMatching.length
		}
	};
}

// ---------- Commit ----------

export async function commitApplication(
	plan: ApplicationPlan,
	decisions: Record<string, ConflictDecision>,
	actorId: string | null
): Promise<CommitResult> {
	const errors: string[] = [];
	let created = 0;
	let deleted = 0;
	let skipped = 0;

	await db.transaction(async (tx) => {
		// 1. Clean inserts for toCreate (no conflicts)
		if (plan.toCreate.length > 0) {
			await tx.insert(shifts).values(
				plan.toCreate.map((slot) => ({
					userId: slot.userId,
					locationId: slot.locationId,
					startTime: slot.startUtc,
					endTime: slot.endUtc,
					notes: slot.notes,
					createdBy: actorId,
					templateId: plan.templateId,
					templateShiftId: slot.templateShiftId
				}))
			);
			created += plan.toCreate.length;
		}

		// 2. Handle conflicts per decision
		for (const conflict of plan.conflicts) {
			const decision = decisions[conflict.slot.slotKey] ?? 'skip';
			if (decision === 'skip') {
				skipped++;
				continue;
			}
			if (decision === 'overwrite') {
				const existingIds = conflict.existing.map((e) => e.id);
				if (existingIds.length > 0) {
					await tx.delete(shifts).where(inArray(shifts.id, existingIds));
					deleted += existingIds.length;
				}
				await tx.insert(shifts).values({
					userId: conflict.slot.userId,
					locationId: conflict.slot.locationId,
					startTime: conflict.slot.startUtc,
					endTime: conflict.slot.endUtc,
					notes: conflict.slot.notes,
					createdBy: actorId,
					templateId: plan.templateId,
					templateShiftId: conflict.slot.templateShiftId
				});
				created++;
				continue;
			}
			if (decision === 'add_alongside') {
				await tx.insert(shifts).values({
					userId: conflict.slot.userId,
					locationId: conflict.slot.locationId,
					startTime: conflict.slot.startUtc,
					endTime: conflict.slot.endUtc,
					notes: conflict.slot.notes,
					createdBy: actorId,
					templateId: plan.templateId,
					templateShiftId: conflict.slot.templateShiftId
				});
				created++;
			}
		}
	});

	log.info(
		{ templateId: plan.templateId, created, deleted, skipped, decisionCount: Object.keys(decisions).length },
		'Schedule template commit applied'
	);
	return { created, deleted, skipped, errors };
}

/**
 * Gap-fill only — used by the cron. Inserts toCreate shifts, touches nothing else.
 */
export async function commitGapFillOnly(
	plan: ApplicationPlan,
	actorId: string | null
): Promise<CommitResult> {
	if (plan.toCreate.length === 0) {
		return { created: 0, deleted: 0, skipped: plan.conflicts.length, errors: [] };
	}
	await db.insert(shifts).values(
		plan.toCreate.map((slot) => ({
			userId: slot.userId,
			locationId: slot.locationId,
			startTime: slot.startUtc,
			endTime: slot.endUtc,
			notes: slot.notes,
			createdBy: actorId,
			templateId: plan.templateId,
			templateShiftId: slot.templateShiftId
		}))
	);
	return {
		created: plan.toCreate.length,
		deleted: 0,
		skipped: plan.conflicts.length,
		errors: []
	};
}

// ---------- Drift validation ----------

export async function validateRange(params: {
	templateId?: string;
	startDate: string;
	endDate: string;
}): Promise<DriftReport> {
	let templateId = params.templateId;
	if (!templateId) {
		const def = await getDefaultTemplate();
		if (!def) {
			throw new Error('No default template set and no templateId provided');
		}
		templateId = def.id;
	}

	// Reuse planner logic: produce the set of expected slots + existing shifts
	const plan = await planApplication({
		templateId,
		startDate: params.startDate,
		endDate: params.endDate
	});

	// planApplication categorizes slots as toCreate (missing), alreadyMatching, or conflicts.
	// For drift, we need to also identify "extra" shifts — actual shifts whose slot is not in the template at all.

	// Gather all slot keys the template would produce
	const template = await getTemplate(templateId);
	if (!template) throw new Error('Template not found');
	const dates = enumerateDates(params.startDate, params.endDate);
	const expectedSlotKeys = new Set<string>();
	const slotsByKey = new Map<string, TemplateSlotInstance>();
	for (const date of dates) {
		const dow = dayOfWeekForPacificDate(date);
		for (const tShift of template.shifts) {
			if (tShift.dayOfWeek !== dow) continue;
			const slot = materializeSlot(tShift, date);
			expectedSlotKeys.add(slot.slotKey);
			slotsByKey.set(slot.slotKey, slot);
		}
	}

	// Fetch all actual shifts in the range
	const rangeStart = createPacificDateTime(params.startDate, 0, 0);
	const rangeEnd = new Date(
		createPacificDateTime(params.endDate, 0, 0).getTime() + 24 * 60 * 60 * 1000
	);
	const actual = await db
		.select({
			id: shifts.id,
			userId: shifts.userId,
			locationId: shifts.locationId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			notes: shifts.notes,
			templateShiftId: shifts.templateShiftId
		})
		.from(shifts)
		.where(and(gte(shifts.startTime, rangeStart), lt(shifts.startTime, rangeEnd)));

	const extra: ExistingShiftLite[] = [];
	const matching: ExistingShiftLite[] = [];
	const modified: DriftReport['modified'] = [];

	for (const shift of actual) {
		const key = shiftSlotKey(shift);
		const slot = slotsByKey.get(key);
		if (!slot) {
			extra.push(shift);
			continue;
		}
		// Same user/date/start — compare endTime + location for modifications
		const existingEndHHMM = to24HourPacific(shift.endTime);
		const diffs: string[] = [];
		if (existingEndHHMM !== slot.endTime) {
			diffs.push(`endTime: ${existingEndHHMM} → ${slot.endTime}`);
		}
		if ((shift.locationId ?? null) !== (slot.locationId ?? null)) {
			diffs.push(`locationId: ${shift.locationId ?? 'null'} → ${slot.locationId ?? 'null'}`);
		}
		if (diffs.length === 0) matching.push(shift);
		else modified.push({ slot, shift, diffs });
	}

	// Missing = template slots that have no corresponding shift. Derive from planApplication's toCreate
	// PLUS any conflicts where user has a shift at a different start time (those are "modified" at a broader
	// level but without the same key — skip; they'll already be surfaced as "extra" and "missing" separately).
	const missing = plan.toCreate;

	const totalExpected = expectedSlotKeys.size;
	const missingCount = missing.length;
	const extraCount = extra.length;
	const modifiedCount = modified.length;
	const matchingCount = matching.length;
	const driftPercent =
		totalExpected === 0
			? extraCount > 0
				? 100
				: 0
			: Math.round(((missingCount + modifiedCount) / totalExpected) * 100);

	return {
		templateId,
		startDate: params.startDate,
		endDate: params.endDate,
		missing,
		extra,
		modified,
		matching,
		summary: {
			missingCount,
			extraCount,
			modifiedCount,
			matchingCount,
			driftPercent
		}
	};
}

// ---------- Auto-apply (cron) ----------

interface ScheduleTemplateConfig {
	enabled: boolean;
	weeksAhead: number;
	cronLastRun: number | null;
}

const DEFAULT_CONFIG: ScheduleTemplateConfig = {
	enabled: true,
	weeksAhead: 4,
	cronLastRun: null
};

export async function getScheduleTemplateConfig(): Promise<ScheduleTemplateConfig> {
	const [row] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'schedule_template_config'))
		.limit(1);
	if (!row) return { ...DEFAULT_CONFIG };
	try {
		const parsed = JSON.parse(row.value) as Partial<ScheduleTemplateConfig>;
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		log.warn('Failed to parse schedule_template_config; falling back to defaults');
		return { ...DEFAULT_CONFIG };
	}
}

export async function updateScheduleTemplateConfig(
	patch: Partial<ScheduleTemplateConfig>
): Promise<ScheduleTemplateConfig> {
	const current = await getScheduleTemplateConfig();
	const next: ScheduleTemplateConfig = { ...current, ...patch };
	await db
		.insert(appSettings)
		.values({ key: 'schedule_template_config', value: JSON.stringify(next) })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: JSON.stringify(next), updatedAt: new Date() }
		});
	return next;
}

/**
 * Returns the Pacific week-start (Sunday) date as YYYY-MM-DD for a given UTC date.
 */
function weekStartString(date: Date): string {
	return toPacificDateString(getPacificWeekStart(date));
}

/**
 * Auto-apply the active default template for the next `weeksAhead` weeks.
 * Always uses gap-fill (never overwrites).
 * Intended to be called from the cron endpoint with its own 24hr gate.
 */
export async function autoApplyDefaultTemplate(
	weeksAhead: number,
	actorId: string | null
): Promise<{ weeksProcessed: number; shiftsCreated: number; errors: string[] }> {
	const def = await getDefaultTemplate();
	if (!def) {
		log.info('No default schedule template set — skipping auto-apply');
		return { weeksProcessed: 0, shiftsCreated: 0, errors: [] };
	}

	const now = new Date();
	const currentWeekStart = getPacificWeekStart(now);
	const errors: string[] = [];
	let weeksProcessed = 0;
	let shiftsCreated = 0;

	// Process weeks 1..weeksAhead (skip the current week — preserve in-flight edits)
	for (let i = 1; i <= weeksAhead; i++) {
		const weekStart = new Date(currentWeekStart.getTime() + i * 7 * 24 * 60 * 60 * 1000);
		const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
		const startDate = toPacificDateString(weekStart);
		const endDate = toPacificDateString(weekEnd);

		try {
			const plan = await planApplication({
				templateId: def.id,
				startDate,
				endDate
			});
			const result = await commitGapFillOnly(plan, actorId);
			shiftsCreated += result.created;
			weeksProcessed++;
			log.info(
				{
					week: startDate,
					created: result.created,
					conflictsSkipped: plan.conflicts.length,
					alreadyMatching: plan.alreadyMatching.length
				},
				'Schedule template auto-applied to week'
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			errors.push(`week ${startDate}: ${msg}`);
			log.error({ err, week: startDate }, 'Auto-apply failed for week');
		}
	}

	return { weeksProcessed, shiftsCreated, errors };
}
