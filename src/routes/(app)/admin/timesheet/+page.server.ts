import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, timeEntries, users, appSettings, clockOutWarnings, breakEntries, auditLogs } from '$lib/server/db';
import { eq, and, gte, lte, desc, inArray, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isManager } from '$lib/server/auth/roles';
import { audit } from '$lib/server/services/audit-service';
import { getSchedulableStaff } from '$lib/server/services/user-classification-service';
import { createLogger } from '$lib/server/logger';
import {
	toPacificDateString,
	toPacificTimeString,
	toPacificDateTimeString,
	toPacificDatetimeLocal,
	parsePacificDate,
	parsePacificEndOfDay,
	parsePacificDatetime
} from '$lib/server/utils/timezone';
import {
	loadPayPeriodConfig,
	calculatePayPeriods,
	lastCompletedPayPeriod,
	formatShortDate
} from '$lib/server/utils/pay-periods';

const log = createLogger('admin:timesheet');

// Audit actions that count as a payroll-relevant change. Shown in the change
// log on this page so the person preparing payroll (a manager, not an admin)
// can see every manual adjustment without needing /admin/audit-logs.
const CHANGE_ACTIONS = [
	'time_entry_created',
	'time_entry_updated',
	'time_entry_deleted',
	'schedule_created',
	'schedule_updated',
	'schedule_deleted'
];

function fmtDt(v: unknown): string {
	if (typeof v !== 'string' || !v) return '—';
	const d = new Date(v);
	return isNaN(d.getTime()) ? '—' : toPacificDateTimeString(d);
}

function str(v: unknown): string | null {
	return typeof v === 'string' && v ? v : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const payPeriodConfig = await loadPayPeriodConfig();
	const payPeriods = calculatePayPeriods(payPeriodConfig, 8);

	// Get date range from query params or default to previous (most recently completed) pay period
	let startParam = url.searchParams.get('start');
	let endParam = url.searchParams.get('end');

	if (!startParam || !endParam) {
		const previousPeriod = lastCompletedPayPeriod(payPeriods);
		if (previousPeriod) {
			startParam = previousPeriod.startDate;
			endParam = previousPeriod.endDate;
		} else {
			endParam = new Date().toISOString().split('T')[0];
			startParam = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		}
	}

	// Pacific-day boundaries: 00:00:00 on start day through 23:59:59 on end day
	const startDate = parsePacificDate(startParam);
	const endDate = parsePacificEndOfDay(endParam);

	// Query time entries with user info
	const editor = alias(users, 'editor');
	const entries = await db
		.select({
			entryId: timeEntries.id,
			userId: users.id,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			notes: timeEntries.notes,
			updatedBy: timeEntries.updatedBy,
			updatedByName: editor.name,
			updatedAt: timeEntries.updatedAt
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.leftJoin(editor, eq(timeEntries.updatedBy, editor.id))
		.where(and(
			gte(timeEntries.clockIn, startDate),
			lte(timeEntries.clockIn, endDate)
		))
		.orderBy(users.name, timeEntries.clockIn);

	// Get force clock-out warnings for entries in this range
	const entryIds = entries.map(e => e.entryId);
	const forceClockOuts = new Set<string>();

	if (entryIds.length > 0) {
		const warnings = await db
			.select({ timeEntryId: clockOutWarnings.timeEntryId })
			.from(clockOutWarnings)
			.where(eq(clockOutWarnings.warningType, 'force_clockout'));

		for (const w of warnings) {
			if (entryIds.includes(w.timeEntryId)) {
				forceClockOuts.add(w.timeEntryId);
			}
		}
	}

	// Query break entries for all time entries in range
	const breakMinutesByEntry = new Map<string, number>();
	if (entryIds.length > 0) {
		const breakData = await db
			.select({
				timeEntryId: breakEntries.timeEntryId,
				breakStart: breakEntries.breakStart,
				breakEnd: breakEntries.breakEnd
			})
			.from(breakEntries)
			.where(inArray(breakEntries.timeEntryId, entryIds));

		for (const b of breakData) {
			if (b.breakStart && b.breakEnd) {
				const minutes = (b.breakEnd.getTime() - b.breakStart.getTime()) / (1000 * 60);
				breakMinutesByEntry.set(
					b.timeEntryId,
					(breakMinutesByEntry.get(b.timeEntryId) || 0) + minutes
				);
			}
		}
	}

	// Load break allowance config
	const [breakAllowanceSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'break_allowance_config'))
		.limit(1);

	let breakAllowanceConfig = { minutesPer: 15, perHours: 4 };
	if (breakAllowanceSetting) {
		try { breakAllowanceConfig = JSON.parse(breakAllowanceSetting.value); } catch { /* use default */ }
	}

	// Group by employee, then by date (Pacific timezone)
	const employeeMap = new Map<string, {
		userId: string;
		name: string;
		daysMap: Map<string, {
			date: string;
			dayLabel: string;
			entries: Array<{
				id: string;
				clockIn: string;
				clockOut: string | null;
				clockInLocal: string;
				clockOutLocal: string;
				clockInFormatted: string;
				clockOutFormatted: string;
				hours: number;
				breakMinutes: number;
				allowedBreakMinutes: number;
				excessBreakMinutes: number;
				wasForceClockOut: boolean;
				edited: boolean;
				editedBy: string | null;
				notes: string | null;
			}>;
		}>;
		totalHours: number;
	}>();

	for (const entry of entries) {
		if (!employeeMap.has(entry.userId)) {
			employeeMap.set(entry.userId, {
				userId: entry.userId,
				name: entry.userName,
				daysMap: new Map(),
				totalHours: 0
			});
		}

		const emp = employeeMap.get(entry.userId)!;
		const pacificDate = entry.clockIn ? toPacificDateString(entry.clockIn) : 'unknown';

		if (!emp.daysMap.has(pacificDate)) {
			const dateObj = new Date(pacificDate + 'T12:00:00');
			emp.daysMap.set(pacificDate, {
				date: pacificDate,
				dayLabel: dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
				entries: []
			});
		}

		const day = emp.daysMap.get(pacificDate)!;
		let rawHours = 0;
		if (entry.clockIn && entry.clockOut) {
			rawHours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
		}

		// Break allowance calculation
		const breakMinutes = Math.round((breakMinutesByEntry.get(entry.entryId) || 0) * 100) / 100;
		const allowedBreakMinutes = Math.round(rawHours * (breakAllowanceConfig.minutesPer / breakAllowanceConfig.perHours) * 100) / 100;
		const excessBreakMinutes = Math.max(0, Math.round((breakMinutes - allowedBreakMinutes) * 100) / 100);

		// Deduct only excess break time from hours
		let hours = rawHours - (excessBreakMinutes / 60);
		hours = Math.max(0, Math.round(hours * 100) / 100);

		emp.totalHours += hours;

		day.entries.push({
			id: entry.entryId,
			clockIn: entry.clockIn?.toISOString() || '',
			clockOut: entry.clockOut?.toISOString() || null,
			clockInLocal: entry.clockIn ? toPacificDatetimeLocal(entry.clockIn) : '',
			clockOutLocal: entry.clockOut ? toPacificDatetimeLocal(entry.clockOut) : '',
			clockInFormatted: entry.clockIn ? toPacificTimeString(entry.clockIn) : '-',
			clockOutFormatted: entry.clockOut ? toPacificTimeString(entry.clockOut) : 'Active',
			hours,
			breakMinutes,
			allowedBreakMinutes,
			excessBreakMinutes,
			wasForceClockOut: forceClockOuts.has(entry.entryId),
			// updatedBy is only ever set by a manual (manager or AI) adjustment;
			// ordinary clock-out leaves it null.
			edited: !!entry.updatedBy,
			editedBy: entry.updatedByName ?? null,
			notes: entry.notes
		});
	}

	// Convert to sorted arrays
	const employees = Array.from(employeeMap.values())
		.map(emp => {
			const days = Array.from(emp.daysMap.values())
				.sort((a, b) => a.date.localeCompare(b.date))
				.map(day => ({
					...day,
					dailyHours: Math.round(day.entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100
				}));

			return {
				userId: emp.userId,
				name: emp.name,
				days,
				totalHours: Math.round(emp.totalHours * 100) / 100
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const periodLabel = `${formatShortDate(startParam)} - ${formatShortDate(endParam)}`;

	// Change log: manual adjustments to time entries and shifts that affect
	// this pay period. Entries written by this page carry affectedDate; older
	// ones (AI edits, schedule deletes) are matched on the timestamps they store.
	const actor = alias(users, 'actor');
	const rawChanges = await db
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			entityType: auditLogs.entityType,
			entityId: auditLogs.entityId,
			beforeData: auditLogs.beforeData,
			afterData: auditLogs.afterData,
			createdAt: auditLogs.createdAt,
			actorName: actor.name
		})
		.from(auditLogs)
		.leftJoin(actor, eq(auditLogs.userId, actor.id))
		.where(inArray(auditLogs.action, CHANGE_ACTIONS))
		.orderBy(desc(auditLogs.createdAt))
		.limit(500);

	const inPeriod = (iso: unknown) => {
		if (typeof iso !== 'string') return false;
		const d = new Date(iso);
		return !isNaN(d.getTime()) && d >= startDate && d <= endDate;
	};

	const changes = rawChanges
		.filter((c) => {
			const a = c.afterData ?? {};
			const b = c.beforeData ?? {};
			const affected = str(a.affectedDate) ?? str(b.affectedDate);
			if (affected) return affected >= startParam! && affected <= endParam!;
			return [a.clockIn, a.startTime, b.clockIn, b.startTime].some(inPeriod);
		})
		.map((c) => {
			const a = c.afterData ?? {};
			const b = c.beforeData ?? {};
			const isShift = c.entityType === 'schedule';
			const fromStart = isShift ? b.startTime : b.clockIn;
			const fromEnd = isShift ? b.endTime : b.clockOut;
			const toStart = isShift ? a.startTime : a.clockIn;
			const toEnd = isShift ? a.endTime : a.clockOut;
			const verb = c.action.endsWith('_created') ? 'added' : c.action.endsWith('_deleted') ? 'deleted' : 'changed';
			return {
				id: c.id,
				when: toPacificDateTimeString(c.createdAt),
				by: c.actorName ?? (str(a.source) === 'ai_edit' ? 'Office Manager (AI)' : 'System'),
				what: `${isShift ? 'Shift' : 'Time entry'} ${verb}`,
				employee: str(a.employeeName) ?? str(b.employeeName) ?? '—',
				before: verb === 'added' ? null : `${fmtDt(fromStart)} → ${fmtDt(fromEnd)}`,
				after: verb === 'deleted' ? null : `${fmtDt(toStart)} → ${fmtDt(toEnd)}`,
				reason: str(a.reason) ?? str(a.notes) ?? null
			};
		});

	return {
		employees,
		startDate: startParam,
		endDate: endParam,
		periodLabel,
		payPeriods,
		staff: await getSchedulableStaff(),
		changes,
		grandTotals: {
			totalHours: Math.round(employees.reduce((sum, e) => sum + e.totalHours, 0) * 100) / 100,
			employeeCount: employees.length
		}
	};
};

// ---------------------------------------------------------------------------
// Manual adjustments. Every write records who, what, before/after and why.
// ---------------------------------------------------------------------------

const MAX_SHIFT_HOURS = 24;

function parseLocal(value: FormDataEntryValue | null): Date | null | 'invalid' {
	const s = value?.toString().trim() ?? '';
	if (!s) return null;
	try {
		const d = parsePacificDatetime(s);
		return isNaN(d.getTime()) ? 'invalid' : d;
	} catch {
		return 'invalid';
	}
}

/** Shared validation for a (clockIn, clockOut) pair; returns an error message or null. */
async function validateTimes(
	userId: string,
	clockIn: Date,
	clockOut: Date | null,
	excludeEntryId: string | null
): Promise<string | null> {
	const now = new Date();
	if (clockIn > now) return 'Clock-in cannot be in the future';
	if (clockOut && clockOut > now) return 'Clock-out cannot be in the future';
	if (clockOut && clockOut <= clockIn) return 'Clock-out must be after clock-in';
	if (clockOut) {
		const hours = (clockOut.getTime() - clockIn.getTime()) / 3_600_000;
		if (hours > MAX_SHIFT_HOURS) return `Entry is ${hours.toFixed(1)} hours; maximum is ${MAX_SHIFT_HOURS}`;
	}

	// Overlap with any other entry for the same employee.
	const end = clockOut ?? now;
	const conds = [
		eq(timeEntries.userId, userId),
		lte(timeEntries.clockIn, end),
		or(sql`${timeEntries.clockOut} IS NULL`, gte(timeEntries.clockOut, clockIn))
	];
	if (excludeEntryId) conds.push(ne(timeEntries.id, excludeEntryId));
	const [overlap] = await db
		.select({ clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut })
		.from(timeEntries)
		.where(and(...conds))
		.limit(1);
	if (overlap) {
		return `Overlaps an existing entry (${toPacificDateTimeString(overlap.clockIn)} – ${overlap.clockOut ? toPacificDateTimeString(overlap.clockOut) : 'still active'})`;
	}
	return null;
}

function getReason(form: FormData): string | null {
	const reason = form.get('reason')?.toString().trim() ?? '';
	if (reason.length < 3) return null;
	return reason.slice(0, 500);
}

export const actions: Actions = {
	updateEntry: async ({ request, locals, getClientAddress }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		const entryId = form.get('entryId')?.toString() ?? '';
		const reason = getReason(form);
		const clockIn = parseLocal(form.get('clockIn'));
		const clockOut = parseLocal(form.get('clockOut'));

		if (!entryId) return fail(400, { error: 'Entry ID required' });
		if (!reason) return fail(400, { error: 'A reason for the change is required' });
		if (clockIn === null || clockIn === 'invalid') return fail(400, { error: 'Clock-in is required' });
		if (clockOut === 'invalid') return fail(400, { error: 'Clock-out is not a valid time' });

		const [existing] = await db
			.select({
				id: timeEntries.id,
				userId: timeEntries.userId,
				userName: users.name,
				clockIn: timeEntries.clockIn,
				clockOut: timeEntries.clockOut
			})
			.from(timeEntries)
			.innerJoin(users, eq(timeEntries.userId, users.id))
			.where(eq(timeEntries.id, entryId))
			.limit(1);
		if (!existing) return fail(404, { error: 'Time entry not found' });

		const problem = await validateTimes(existing.userId, clockIn, clockOut, entryId);
		if (problem) return fail(400, { error: problem });

		const unchanged =
			existing.clockIn.getTime() === clockIn.getTime() &&
			(existing.clockOut?.getTime() ?? null) === (clockOut?.getTime() ?? null);
		if (unchanged) return fail(400, { error: 'No change to the times' });

		try {
			await db
				.update(timeEntries)
				.set({ clockIn, clockOut, updatedAt: new Date(), updatedBy: locals.user!.id })
				.where(eq(timeEntries.id, entryId));

			await audit({
				userId: locals.user!.id,
				action: 'time_entry_updated',
				entityType: 'time_entry',
				entityId: entryId,
				ipAddress: getClientAddress(),
				beforeData: {
					clockIn: existing.clockIn.toISOString(),
					clockOut: existing.clockOut?.toISOString() ?? null
				},
				afterData: {
					clockIn: clockIn.toISOString(),
					clockOut: clockOut?.toISOString() ?? null,
					employeeId: existing.userId,
					employeeName: existing.userName,
					affectedDate: toPacificDateString(clockIn),
					reason,
					source: 'timesheet'
				}
			});
			return { success: true, message: `Updated ${existing.userName}'s entry` };
		} catch (error) {
			log.error({ error, entryId }, 'Failed to update time entry');
			return fail(500, { error: 'Failed to update time entry' });
		}
	},

	createEntry: async ({ request, locals, getClientAddress }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		const userId = form.get('userId')?.toString() ?? '';
		const reason = getReason(form);
		const clockIn = parseLocal(form.get('clockIn'));
		const clockOut = parseLocal(form.get('clockOut'));

		if (!userId) return fail(400, { error: 'Employee is required' });
		if (!reason) return fail(400, { error: 'A reason for the change is required' });
		if (clockIn === null || clockIn === 'invalid') return fail(400, { error: 'Clock-in is required' });
		if (clockOut === null || clockOut === 'invalid') return fail(400, { error: 'Clock-out is required for a manually added entry' });

		const staff = await getSchedulableStaff();
		const employee = staff.find((s) => s.id === userId);
		if (!employee) return fail(400, { error: 'That user cannot have time entries' });

		const problem = await validateTimes(userId, clockIn, clockOut, null);
		if (problem) return fail(400, { error: problem });

		try {
			const [created] = await db
				.insert(timeEntries)
				.values({
					userId,
					clockIn,
					clockOut,
					notes: `Added manually by ${locals.user!.name}: ${reason}`,
					updatedBy: locals.user!.id
				})
				.returning({ id: timeEntries.id });

			await audit({
				userId: locals.user!.id,
				action: 'time_entry_created',
				entityType: 'time_entry',
				entityId: created.id,
				ipAddress: getClientAddress(),
				afterData: {
					clockIn: clockIn.toISOString(),
					clockOut: clockOut.toISOString(),
					employeeId: userId,
					employeeName: employee.name,
					affectedDate: toPacificDateString(clockIn),
					reason,
					source: 'timesheet'
				}
			});
			return { success: true, message: `Added entry for ${employee.name}` };
		} catch (error) {
			log.error({ error, userId }, 'Failed to create time entry');
			return fail(500, { error: 'Failed to add time entry' });
		}
	},

	deleteEntry: async ({ request, locals, getClientAddress }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		const entryId = form.get('entryId')?.toString() ?? '';
		const reason = getReason(form);
		if (!entryId) return fail(400, { error: 'Entry ID required' });
		if (!reason) return fail(400, { error: 'A reason for the change is required' });

		const [existing] = await db
			.select({
				id: timeEntries.id,
				userId: timeEntries.userId,
				userName: users.name,
				clockIn: timeEntries.clockIn,
				clockOut: timeEntries.clockOut
			})
			.from(timeEntries)
			.innerJoin(users, eq(timeEntries.userId, users.id))
			.where(eq(timeEntries.id, entryId))
			.limit(1);
		if (!existing) return fail(404, { error: 'Time entry not found' });
		if (!existing.clockOut) return fail(400, { error: 'Cannot delete an active entry — clock the employee out first' });

		try {
			await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
			await audit({
				userId: locals.user!.id,
				action: 'time_entry_deleted',
				entityType: 'time_entry',
				entityId: entryId,
				ipAddress: getClientAddress(),
				beforeData: {
					clockIn: existing.clockIn.toISOString(),
					clockOut: existing.clockOut.toISOString(),
					employeeId: existing.userId,
					employeeName: existing.userName,
					affectedDate: toPacificDateString(existing.clockIn)
				},
				afterData: { reason, source: 'timesheet', employeeName: existing.userName, affectedDate: toPacificDateString(existing.clockIn) }
			});
			return { success: true, message: `Deleted ${existing.userName}'s entry` };
		} catch (error) {
			log.error({ error, entryId }, 'Failed to delete time entry');
			return fail(500, { error: 'Failed to delete time entry' });
		}
	}
};
